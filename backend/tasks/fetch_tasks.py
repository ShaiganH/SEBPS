import logging
from datetime import datetime, timezone

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=2, time_limit=300)  # 5 min — Playwright needs time
def run_lesco_fetch(self, job_id: int):
    """
    Fetch 12-month LESCO history via Playwright, store bills in DB.
    """
    from apps.bills.models import BillRecord, LescoFetchJob
    from services.fetcher_service import fetch_lesco_history

    job = LescoFetchJob.objects.get(pk=job_id)
    job.status = LescoFetchJob.STATUS_RUNNING
    job.save(update_fields=["status"])

    try:
        data = fetch_lesco_history(ref_no=job.ref_no, headless=True, verbose=False)

        saved = 0
        for row in data.get("raw_rows", []):
            _, created = BillRecord.objects.update_or_create(
                user=job.user,
                year=row["year"],
                mon_idx=row["mon_idx"],
                defaults={
                    "month_label": row["month"],
                    "units": row["units"],
                    "bill_amount": row["bill"],
                    "payment_amount": row.get("payment"),
                    "source": BillRecord.SOURCE_LESCO,
                },
            )
            if created:
                saved += 1

        # Update user ref_no if not set
        if not job.user.ref_no:
            job.user.ref_no = job.ref_no
            job.user.save(update_fields=["ref_no"])

        job.status = LescoFetchJob.STATUS_SUCCESS
        job.months_fetched = len(data.get("raw_rows", []))
        job.result_summary = {
            "new_records": saved,
            "total_records": job.months_fetched,
            "history_months": data.get("history_months", []),
        }
        job.completed_at = datetime.now(tz=timezone.utc)
        job.save()

        _send_notification(
            user=job.user,
            notif_type="fetch_complete",
            title="Billing History Fetched",
            message=(
                f"Successfully fetched {job.months_fetched} months of LESCO history. "
                f"Generating your bill prediction now…"
            ),
            data={"job_id": job_id, "months": job.months_fetched},
        )

        logger.info(f"Fetch job #{job_id}: {job.months_fetched} months, {saved} new records.")

        # ── Auto-trigger prediction immediately after bills are stored ─────────
        from tasks.prediction_tasks import auto_predict_for_user
        auto_predict_for_user.delay(user_id=job.user.id)

        return {"job_id": job_id, "months_fetched": job.months_fetched}

    except Exception as exc:
        logger.exception(f"Fetch job #{job_id} failed: {exc}")
        job.status = LescoFetchJob.STATUS_FAILED
        job.error_message = str(exc)
        job.completed_at = datetime.now(tz=timezone.utc)
        job.save()

        _send_notification(
            user=job.user,
            notif_type="fetch_complete",
            title="Billing History Fetch Failed",
            message=f"Could not fetch LESCO history: {exc}",
            data={"job_id": job_id, "error": str(exc)},
        )
        raise self.retry(exc=exc, countdown=60)


def _send_notification(user, notif_type, title, message, data=None):
    try:
        from apps.notifications.models import Notification
        Notification.objects.create(
            user=user, type=notif_type, title=title, message=message, data=data
        )
    except Exception as e:
        logger.warning(f"Failed to create notification: {e}")
