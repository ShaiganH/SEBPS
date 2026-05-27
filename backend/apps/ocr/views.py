from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from tasks.ocr_tasks import run_ocr_job

from .models import OCRJob
from .serializers import OCRConfirmSerializer, OCRJobSerializer, OCRUploadSerializer


class OCRUploadView(APIView):
    """
    POST /api/v1/ocr/upload/
    Step 1: Upload bill image → async OCR starts → returns job ID.
    Poll /ocr/status/<id>/ to get the extracted ref_no.
    Then call /ocr/<id>/confirm/ to kick off the LESCO fetch.
    """

    def post(self, request):
        serializer = OCRUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        job = OCRJob.objects.create(
            user=request.user,
            image=serializer.validated_data["image"],
        )
        auto_fetch = serializer.validated_data.get("auto_fetch", False)
        task = run_ocr_job.delay(job.id, auto_fetch=auto_fetch)
        job.celery_task_id = task.id
        job.status = OCRJob.STATUS_RUNNING
        job.save(update_fields=["celery_task_id", "status"])

        return Response(
            {
                **OCRJobSerializer(job).data,
                "message": "OCR job started. Poll /ocr/status/<id>/ for result.",
            },
            status=status.HTTP_202_ACCEPTED,
        )


class OCRJobStatusView(generics.RetrieveAPIView):
    """GET /api/v1/ocr/status/<pk>/ — poll until status = 'success' or 'failed'."""
    serializer_class = OCRJobSerializer

    def get_object(self):
        return get_object_or_404(OCRJob, pk=self.kwargs["pk"], user=self.request.user)


class OCRConfirmView(APIView):
    """
    POST /api/v1/ocr/<pk>/confirm/
    Step 2: User sees extracted ref_no, can correct it, then confirms.
    This triggers the LESCO history fetch job.

    Body: {"ref_no": "08 11274 1172000U"}
    If ref_no is omitted, uses the OCR-extracted value as-is.
    """

    def post(self, request, pk):
        job = get_object_or_404(OCRJob, pk=pk, user=request.user)

        if job.status == OCRJob.STATUS_RUNNING:
            return Response(
                {"detail": "OCR is still running. Please wait and poll /ocr/status/<id>/ first."},
                status=status.HTTP_409_CONFLICT,
            )

        serializer = OCRConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        ref_no = serializer.validated_data.get("ref_no") or job.extracted_ref_no
        if not ref_no:
            return Response(
                {
                    "detail": "No reference number available. OCR extraction failed. "
                              "Please enter the reference number manually.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Save user-confirmed ref_no (may differ from OCR extraction)
        job.extracted_ref_no = ref_no
        job.save(update_fields=["extracted_ref_no"])

        # Save to user profile if not already set
        if not request.user.ref_no:
            request.user.ref_no = ref_no
            request.user.save(update_fields=["ref_no"])

        # Trigger LESCO fetch
        from apps.bills.models import LescoFetchJob
        from tasks.fetch_tasks import run_lesco_fetch

        fetch_job = LescoFetchJob.objects.create(user=request.user, ref_no=ref_no)
        task = run_lesco_fetch.delay(fetch_job.id)
        fetch_job.celery_task_id = task.id
        fetch_job.status = LescoFetchJob.STATUS_RUNNING
        fetch_job.save(update_fields=["celery_task_id", "status"])

        return Response(
            {
                "confirmed_ref_no": ref_no,
                "fetch_job_id": fetch_job.id,
                "message": (
                    f"Confirmed! Fetching LESCO history for {ref_no}. "
                    f"Poll /bills/fetch/{fetch_job.id}/ for progress. "
                    f"Prediction will generate automatically when done."
                ),
            },
            status=status.HTTP_202_ACCEPTED,
        )


class OCRHistoryView(generics.ListAPIView):
    """GET /api/v1/ocr/history/ — all OCR jobs for current user."""
    serializer_class = OCRJobSerializer

    def get_queryset(self):
        return OCRJob.objects.filter(user=self.request.user)
