import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.base")

# Explicitly include every task module that lives outside INSTALLED_APPS.
# autodiscover_tasks() only scans Django app packages (looks for <app>.tasks),
# but our tasks are in a standalone top-level tasks/ package, so we use
# the `include` parameter to register them unconditionally at worker startup.
app = Celery(
    "sebps",
    include=[
        "tasks.ocr_tasks",
        "tasks.fetch_tasks",
        "tasks.prediction_tasks",
        "tasks.notification_tasks",
        "tasks.iot_tasks",
        "tasks.cycle_tasks",
    ],
)
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()  # still discovers any tasks inside INSTALLED_APPS
