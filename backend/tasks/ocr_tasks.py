import logging
from datetime import datetime, timezone

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=2)
def run_ocr_job(self, job_id: int, auto_fetch: bool = True):
    """
    Run OCR on uploaded bill image, extract reference number.
    If successful and auto_fetch=True, kicks off LESCO history fetch.
    """
    from apps.ocr.models import OCRJob
    from services.ocr_service import extract_reference_number

    job = OCRJob.objects.get(pk=job_id)
    job.status = OCRJob.STATUS_RUNNING
    job.save(update_fields=["status"])

    try:
        image_path = job.image.path
        result = extract_reference_number(image_path)

        job.status = OCRJob.STATUS_SUCCESS if result["success"] else OCRJob.STATUS_FAILED
        job.extracted_ref_no = result.get("ref_no") or ""
        job.confidence = result.get("confidence")
        job.method = result.get("method") or ""
        job.variants_run = result.get("variants_run", 0)
        job.raw_result = result
        job.completed_at = datetime.now(tz=timezone.utc)
        job.save()

        # Notify user
        _send_notification(
            user=job.user,
            notif_type="ocr_complete",
            title="Bill Scan Complete",
            message=(
                f"Reference number extracted: {job.extracted_ref_no}"
                if result["success"]
                else "Could not extract reference number. Try a clearer photo."
            ),
            data={"job_id": job_id, "ref_no": job.extracted_ref_no},
        )

        # Auto-trigger LESCO fetch
        if result["success"] and job.extracted_ref_no and auto_fetch:
            from apps.bills.models import LescoFetchJob
            from tasks.fetch_tasks import run_lesco_fetch  # lazy to avoid circular import
            fetch_job = LescoFetchJob.objects.create(
                user=job.user, ref_no=job.extracted_ref_no
            )
            task = run_lesco_fetch.delay(fetch_job.id)
            fetch_job.celery_task_id = task.id
            fetch_job.status = LescoFetchJob.STATUS_RUNNING
            fetch_job.save(update_fields=["celery_task_id", "status"])
            logger.info(f"Auto-triggered LESCO fetch job #{fetch_job.id} for ref {job.extracted_ref_no}")

        return {"job_id": job_id, "success": result["success"], "ref_no": job.extracted_ref_no}

    except Exception as exc:
        logger.exception(f"OCR job #{job_id} failed: {exc}")
        job.status = OCRJob.STATUS_FAILED
        job.error_message = str(exc)
        job.completed_at = datetime.now(tz=timezone.utc)
        job.save()
        raise self.retry(exc=exc, countdown=30)


def _send_notification(user, notif_type, title, message, data=None):
    try:
        from apps.notifications.models import Notification
        Notification.objects.create(
            user=user, type=notif_type, title=title, message=message, data=data
        )
    except Exception as e:
        logger.warning(f"Failed to create notification: {e}")
