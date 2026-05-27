from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from tasks.fetch_tasks import run_lesco_fetch

from .models import BillRecord, LescoFetchJob
from .serializers import (
    BillRecordSerializer,
    LescoFetchJobSerializer,
    ManualBillSerializer,
    TriggerFetchSerializer,
)


class BillListView(generics.ListAPIView):
    serializer_class = BillRecordSerializer

    def get_queryset(self):
        return BillRecord.objects.filter(user=self.request.user)


class BillDetailView(generics.RetrieveDestroyAPIView):
    serializer_class = BillRecordSerializer

    def get_queryset(self):
        return BillRecord.objects.filter(user=self.request.user)


class ManualBillCreateView(generics.CreateAPIView):
    serializer_class = ManualBillSerializer

    def perform_create(self, serializer):
        serializer.save(user=self.request.user, source=BillRecord.SOURCE_MANUAL)


class TriggerFetchView(APIView):
    """
    POST /api/v1/bills/fetch/
    Manually trigger LESCO history fetch (ref_no entered by user).
    Also triggered automatically after OCR confirmation.
    Once bills are stored, prediction + smart recommendation fire automatically.
    """

    def post(self, request):
        serializer = TriggerFetchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ref_no = serializer.validated_data["ref_no"]

        # Save ref_no to user profile
        if not request.user.ref_no:
            request.user.ref_no = ref_no
            request.user.save(update_fields=["ref_no"])

        job = LescoFetchJob.objects.create(user=request.user, ref_no=ref_no)
        task = run_lesco_fetch.delay(job.id)
        job.celery_task_id = task.id
        job.status = LescoFetchJob.STATUS_RUNNING
        job.save(update_fields=["celery_task_id", "status"])

        return Response(
            {
                **LescoFetchJobSerializer(job).data,
                "message": (
                    f"Fetching LESCO history for {ref_no}. "
                    f"Poll /bills/fetch/{job.id}/ for progress. "
                    "A bill prediction will generate automatically when complete."
                ),
            },
            status=status.HTTP_202_ACCEPTED,
        )


class FetchJobStatusView(generics.RetrieveAPIView):
    serializer_class = LescoFetchJobSerializer

    def get_object(self):
        return get_object_or_404(LescoFetchJob, pk=self.kwargs["pk"], user=self.request.user)


class FetchJobListView(generics.ListAPIView):
    serializer_class = LescoFetchJobSerializer

    def get_queryset(self):
        return LescoFetchJob.objects.filter(user=self.request.user)
