"""
IoT simulator — self-rescheduling Celery task.

Instead of a blocking time.sleep() loop (which fights the Celery hard time
limit), each task invocation:
  1. Generates exactly ONE reading.
  2. Broadcasts it over WebSocket.
  3. Schedules the NEXT invocation after `interval` seconds via countdown.

Each individual task run completes in < 1 second.  No time-limit issues.

Session tracking: `started_at_ts` (ISO string of IoTSimulator.started_at) is
passed through the chain.  If the user clicks Stop (is_running=False) or
clicks Start again (started_at changes), the stale chain detects the mismatch
and stops naturally — no orphaned tasks.
"""
import logging
import random
from datetime import datetime, timezone as dt_tz

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(bind=True, name="tasks.iot_tasks.run_iot_simulator",
             max_retries=0,        # never auto-retry — start fresh from UI
             ignore_result=True)   # readings are in DB; result is noise
def run_iot_simulator(
    self,
    device_pk: int,
    started_at_ts: str,   # session token — ISO string of IoTSimulator.started_at
    session_energy: float = 0.0,
    reading_count: int = 0,
):
    """
    Generate ONE IoT reading, broadcast it, then reschedule self.

    Parameters
    ----------
    device_pk       : IoTDevice primary key
    started_at_ts   : session identifier — if IoTSimulator.started_at no longer
                      matches, this chain is stale and should stop
    session_energy  : cumulative kWh since this simulation session started
    reading_count   : total readings generated in this session
    """
    from apps.iot.models import IoTDevice, IoTReading, IoTSimulator

    # ── Guard: check session is still active ──────────────────────────────────
    try:
        sim = IoTSimulator.objects.select_related("device__user").get(device_id=device_pk)
    except IoTSimulator.DoesNotExist:
        logger.debug(f"[Sim] pk={device_pk}: control record gone — stopping")
        return

    if not sim.is_running:
        logger.info(f"[Sim] '{sim.device.device_id}': stopped by user")
        return

    # Different started_at means the user restarted — let the new chain run
    if sim.started_at and sim.started_at.isoformat() != started_at_ts:
        logger.debug(f"[Sim] '{sim.device.device_id}': stale chain — exiting")
        return

    device = sim.device
    wattage_w = sim.wattage_w          # read every tick → live load changes work
    interval_s = sim.interval_seconds

    # ── Physics simulation (240 V residential supply) ─────────────────────────
    voltage = 240.0 + random.uniform(-3.0, 3.0)
    power   = max(0.0, wattage_w * (1.0 + random.uniform(-0.02, 0.02)))  # ±2 %
    current = power / voltage
    pf      = min(1.0, power / (voltage * current)) if current else 1.0
    freq    = 50.0 + random.uniform(-0.15, 0.15)

    # Accumulate energy: kWh = W × h / 1000
    session_energy += power * (interval_s / 3600.0) / 1000.0
    now = datetime.now(tz=dt_tz.utc)

    # ── Persist reading ───────────────────────────────────────────────────────
    reading = IoTReading.objects.create(
        device=device,
        time=now,
        voltage=round(voltage, 2),
        current=round(current, 4),
        power=round(power, 2),
        energy=round(session_energy, 6),
        frequency=round(freq, 2),
        power_factor=round(pf, 4),
    )
    device.last_seen = now
    device.save(update_fields=["last_seen"])

    # ── WebSocket broadcast ───────────────────────────────────────────────────
    try:
        from apps.iot.serializers import IoTReadingSerializer
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer
        payload = IoTReadingSerializer(reading).data
        async_to_sync(get_channel_layer().group_send)(
            f"iot_{device.device_id}",
            {"type": "iot.reading", "data": payload},
        )
    except Exception as e:
        logger.debug(f"[Sim] WS broadcast error: {e}")

    reading_count += 1

    # ── Periodic budget check (roughly every 60 seconds) ─────────────────────
    ticks_per_minute = max(1, 60 // interval_s)
    if reading_count % ticks_per_minute == 0:
        try:
            from services.iot_service import get_iot_consumption
            from tasks.notification_tasks import check_budget_thresholds
            iot = get_iot_consumption(device.user, days=30)
            if iot["has_data"]:
                check_budget_thresholds.delay(
                    device.user_id,
                    int(iot["units_kwh"]),
                    iot["cost_pkr"],
                )
        except Exception as e:
            logger.debug(f"[Sim] Budget check error: {e}")

    # ── Periodic auto-prediction (every 30 minutes = 1800 s) ──────────────────
    # Also fires on the very first reading so the user gets instant feedback.
    ticks_per_30min = max(1, 1800 // interval_s)
    if reading_count == 1 or reading_count % ticks_per_30min == 0:
        try:
            from tasks.prediction_tasks import auto_predict_for_user
            auto_predict_for_user.delay(device.user_id)
            logger.debug(f"[Sim] Auto-predict queued for user {device.user_id} at tick {reading_count}")
        except Exception as e:
            logger.debug(f"[Sim] Auto-predict dispatch error: {e}")

    # ── Reschedule self after interval_s seconds ──────────────────────────────
    run_iot_simulator.apply_async(
        kwargs={
            "device_pk":    device_pk,
            "started_at_ts": started_at_ts,
            "session_energy": round(session_energy, 6),
            "reading_count": reading_count,
        },
        countdown=interval_s,
    )


@shared_task(name="tasks.iot_tasks.revive_dead_simulators", ignore_result=True)
def revive_dead_simulators():
    """
    Celery Beat watchdog — runs every 30 s.

    Finds every IoTSimulator with is_running=True whose last reading is older
    than 3× its configured interval (meaning the self-rescheduling chain has
    died, e.g. after a worker restart that killed the in-flight task before
    apply_async() was called).

    Revives the chain by seeding session_energy from the last known reading so
    energy values are monotonically increasing — the LAG-delta query in
    _get_iot_context then counts the resumed increments correctly.
    """
    from datetime import timedelta

    from django.utils import timezone

    from apps.iot.models import IoTReading, IoTSimulator

    now = timezone.now()

    for sim in IoTSimulator.objects.filter(is_running=True).select_related("device"):
        if not sim.started_at:
            continue  # simulator was never properly started — skip

        device    = sim.device
        gap_limit = timedelta(seconds=max(sim.interval_seconds * 3, 30))

        last = IoTReading.objects.filter(device=device).order_by("-time").first()

        if last is not None and last.time >= now - gap_limit:
            continue  # chain is alive and well

        # Chain is dead (or device never had a reading) — revive it.
        seed_energy = float(last.energy) if last else 0.0
        logger.info(
            "[Watchdog] Dead chain detected for '%s' "
            "(last reading: %s). Reviving at energy=%.4f kWh.",
            device.device_id,
            last.time if last else "never",
            seed_energy,
        )
        run_iot_simulator.apply_async(kwargs={
            "device_pk":      device.pk,
            "started_at_ts":  sim.started_at.isoformat(),
            "session_energy": seed_energy,
            "reading_count":  0,
        })
