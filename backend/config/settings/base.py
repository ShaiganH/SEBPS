import os
import sys
from datetime import timedelta
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env(DEBUG=(bool, False))
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("SECRET_KEY", default="django-insecure-change-me")

# ── Jazzmin admin theme ───────────────────────────────────────────────────────
JAZZMIN_SETTINGS = {
    "site_title":        "SEBPS Admin",
    "site_header":       "SEBPS",
    "site_brand":        "SEBPS",
    "site_logo":         None,
    "welcome_sign":      "Smart Energy Bill Prediction System",
    "copyright":         "SEBPS — Final Year Project",
    "search_model":      ["accounts.User", "bills.BillRecord"],

    # Top menu
    "topmenu_links": [
        {"name": "Dashboard",  "url": "admin:index"},
        {"name": "API Docs",   "url": "/api/v1/docs/", "new_window": True},
        {"name": "View Site",  "url": "/",             "new_window": True},
    ],

    # Side menu icons (Font Awesome 5)
    "icons": {
        "auth":                          "fas fa-users-cog",
        "apps.accounts.user":            "fas fa-user",
        "apps.bills.billrecord":         "fas fa-file-invoice",
        "apps.bills.lescofetchjob":      "fas fa-cloud-download-alt",
        "apps.ocr.ocrjob":               "fas fa-camera",
        "apps.predictions.prediction":   "fas fa-chart-line",
        "apps.budget.budget":            "fas fa-wallet",
        "apps.appliances.appliance":     "fas fa-plug",
        "apps.iot.iotdevice":            "fas fa-microchip",
        "apps.notifications.notification":"fas fa-bell",
        "apps.recommendations.recommendation": "fas fa-lightbulb",
        "django_celery_beat.periodictask": "fas fa-clock",
        "django_celery_beat.crontabschedule": "fas fa-calendar-alt",
    },
    "default_icon_parents": "fas fa-folder",
    "default_icon_children": "fas fa-circle",

    # UI tweaks
    "related_modal_active":    True,
    "show_ui_builder":         False,
    "changeform_format":       "horizontal_tabs",
    "language_chooser":        False,
}

JAZZMIN_UI_TWEAKS = {
    "navbar_small_text":  False,
    "footer_small_text":  False,
    "body_small_text":    False,
    "brand_small_text":   False,
    "brand_colour":       "navbar-dark",
    "accent":             "accent-warning",   # amber accent matches SEBPS theme
    "navbar":             "navbar-dark",
    "no_navbar_border":   True,
    "navbar_fixed":       True,
    "layout_boxed":       False,
    "footer_fixed":       False,
    "sidebar_fixed":      True,
    "sidebar":            "sidebar-dark-warning",
    "sidebar_nav_small_text": False,
    "sidebar_disable_expand": False,
    "sidebar_nav_child_indent": True,
    "sidebar_nav_compact_style": False,
    "sidebar_nav_legacy_style": False,
    "sidebar_nav_flat_style": False,
    "theme":              "darkly",
    "dark_mode_theme":    "darkly",
    "button_classes": {
        "primary":   "btn-primary",
        "secondary": "btn-secondary",
        "info":      "btn-info",
        "warning":   "btn-warning",
        "danger":    "btn-danger",
        "success":   "btn-success",
    },
}
DEBUG = env("DEBUG")
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["*"])

DJANGO_APPS = [
    "jazzmin",                       # must be before django.contrib.admin
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
    "channels",
    "celery",
    "django_celery_beat",
    "django_celery_results",
    "drf_spectacular",
    "timescale",
]

LOCAL_APPS = [
    "apps.accounts",
    "apps.bills",
    "apps.ocr",
    "apps.predictions",
    "apps.iot",
    "apps.appliances",
    "apps.budget",
    "apps.recommendations",
    "apps.chatbot",
    "apps.notifications",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "middleware.request_logging.RequestLoggingMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# ── Database ──────────────────────────────────────────────────────────────────
DATABASES = {
    "default": env.db("DATABASE_URL", default="postgres://sebps:sebps_pass@localhost:5432/sebps_db"),
}
DATABASES["default"]["ENGINE"] = "timescale.db.backends.postgresql"

# ── Redis + Channels ──────────────────────────────────────────────────────────
REDIS_URL = env("REDIS_URL", default="redis://localhost:6379/0")

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [REDIS_URL],
            "capacity": 1500,
            "expiry": 10,
        },
    }
}

# ── Caching ───────────────────────────────────────────────────────────────────
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": REDIS_URL,
        "OPTIONS": {
            "db": "3",
        },
    }
}

# ── Celery ────────────────────────────────────────────────────────────────────
CELERY_BROKER_URL = env("CELERY_BROKER_URL", default="redis://localhost:6379/1")
# Use Redis as result backend — avoids dependency on django_celery_results table during startup
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", default="redis://localhost:6379/2")
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = "Asia/Karachi"
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 300
CELERY_RESULT_EXTENDED = True
# Suppress broker_connection_retry deprecation warning (Celery 5 → 6 migration)
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True

# ── Celery Beat schedule ───────────────────────────────────────────────────────
# django-celery-beat uses DatabaseScheduler, so these entries are seeded into
# the periodic-task table on first beat startup and then managed via Django admin.
from celery.schedules import crontab  # noqa: E402

CELERY_BEAT_SCHEDULE = {
    # Daily at 00:05 Asia/Karachi — log end-of-cycle summary and kick off
    # fresh LESCO fetch + prediction for every user whose billing cycle
    # starts today (billing_cycle_day == today.day).
    "billing-cycle-rollover": {
        "task": "tasks.cycle_tasks.billing_cycle_rollover",
        "schedule": crontab(hour=0, minute=5),  # 00:05 every day, tz=CELERY_TIMEZONE
    },
    # Every 30 s — detect and revive IoT simulator chains that died after a
    # worker restart or crash (chain is dead when is_running=True but no
    # recent readings exist).  Seeds session_energy from the last known
    # reading so the LAG-delta kWh calculation stays monotonically correct.
    "revive-dead-simulators": {
        "task": "tasks.iot_tasks.revive_dead_simulators",
        "schedule": 30.0,  # seconds
    },
}

# ── Auth ──────────────────────────────────────────────────────────────────────
AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ── DRF ───────────────────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "middleware.exceptions.custom_exception_handler",
}

# ── JWT ───────────────────────────────────────────────────────────────────────
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(
        minutes=env.int("ACCESS_TOKEN_LIFETIME_MINUTES", default=60)
    ),
    "REFRESH_TOKEN_LIFETIME": timedelta(
        days=env.int("REFRESH_TOKEN_LIFETIME_DAYS", default=7)
    ),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": SECRET_KEY,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

# ── CORS ──────────────────────────────────────────────────────────────────────
CORS_ALLOWED_ORIGINS = env.list(
    "CORS_ALLOWED_ORIGINS",
    default=["http://localhost:3000", "http://localhost:8081"],
)
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = [
    "accept", "accept-encoding", "authorization", "content-type",
    "dnt", "origin", "user-agent", "x-csrftoken", "x-requested-with",
    "x-device-token",
]

# ── Static / Media ────────────────────────────────────────────────────────────
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / env("MEDIA_ROOT", default="media")

MAX_UPLOAD_SIZE = env.int("MAX_UPLOAD_SIZE_MB", default=10) * 1024 * 1024

# ── Internationalisation ──────────────────────────────────────────────────────
LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Karachi"
USE_I18N = True
USE_TZ = True

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ── API Docs ──────────────────────────────────────────────────────────────────
SPECTACULAR_SETTINGS = {
    "TITLE": "SEBPS API",
    "DESCRIPTION": "Smart Electricity Bill Prediction System – Backend API",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
}

# ── Module paths (existing Python modules) ────────────────────────────────────
MODULE_BASE = BASE_DIR.parent
PREDICTOR_PATH = str(MODULE_BASE / "module_1_predictor")
OCR_PATH = str(MODULE_BASE / "module_2_ocr")
FETCHER_PATH = str(MODULE_BASE / "module_3_fetcher")
RECOMMENDER_PATH = str(MODULE_BASE / "module_4_recommender")
CHATBOT_PATH = str(MODULE_BASE / "module_5_chatbot")

for p in [PREDICTOR_PATH, OCR_PATH, FETCHER_PATH, RECOMMENDER_PATH, CHATBOT_PATH]:
    if p not in sys.path:
        sys.path.insert(0, p)

# ── Groq ──────────────────────────────────────────────────────────────────────
GROQ_API_KEY = env("GROQ_API_KEY", default="")

# ── Logging ───────────────────────────────────────────────────────────────────
# Ensure the logs/ directory exists before configuring file handlers.
_LOG_DIR = BASE_DIR / "logs"
_LOG_DIR.mkdir(exist_ok=True)

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,

    "formatters": {
        # Used by console — readable in terminal / Docker log stream.
        "console": {
            "format": "{levelname} {asctime} {name}:{lineno} {message}",
            "style": "{",
        },
        # Used by the rotating file handler — full detail for post-mortem.
        "file": {
            "format": (
                "{levelname} {asctime} pid={process} {name}:{lineno}  {message}"
            ),
            "style": "{",
        },
    },

    "filters": {
        # Only pass WARNING and above to the error log file.
        "require_warning": {
            "()": "django.utils.log.CallbackFilter",
            "callback": lambda r: r.levelno >= 30,  # 30 = WARNING
        },
    },

    "handlers": {
        # ── Console (all levels, picked up by Docker / systemd) ───────────────
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "console",
            "level": "DEBUG",
        },

        # ── Rotating error log (WARNING+, 5 MB × 5 files) ────────────────────
        # Captures warnings, errors, and critical events across the whole app.
        "error_file": {
            "class": "logging.handlers.RotatingFileHandler",
            "filename": str(_LOG_DIR / "errors.log"),
            "maxBytes": 5 * 1024 * 1024,   # 5 MB
            "backupCount": 5,
            "formatter": "file",
            "level": "WARNING",
            "filters": ["require_warning"],
            "encoding": "utf-8",
        },

        # ── Rotating access log (INFO+) ────────────────────────────────────────
        # Every request/response line from RequestLoggingMiddleware ends up here.
        "access_file": {
            "class": "logging.handlers.RotatingFileHandler",
            "filename": str(_LOG_DIR / "access.log"),
            "maxBytes": 10 * 1024 * 1024,  # 10 MB
            "backupCount": 3,
            "formatter": "file",
            "level": "INFO",
            "encoding": "utf-8",
        },
    },

    "loggers": {
        # Django internals — INFO on console, WARNING+ to file
        "django": {
            "handlers": ["console", "error_file"],
            "level": "INFO",
            "propagate": False,
        },
        # Django request logger — also writes to access log
        "django.request": {
            "handlers": ["console", "access_file", "error_file"],
            "level": "INFO",
            "propagate": False,
        },

        # Our application namespaces — full DEBUG on console + WARNING+ to file
        "apps": {
            "handlers": ["console", "error_file"],
            "level": "DEBUG",
            "propagate": False,
        },
        "services": {
            "handlers": ["console", "error_file"],
            "level": "DEBUG",
            "propagate": False,
        },
        "tasks": {
            "handlers": ["console", "error_file"],
            "level": "DEBUG",
            "propagate": False,
        },
        "middleware": {
            "handlers": ["console", "access_file", "error_file"],
            "level": "INFO",
            "propagate": False,
        },

        # Root catch-all — anything not matched above still goes to console
        # and the error file so nothing is silently swallowed.
        "": {
            "handlers": ["console", "error_file"],
            "level": "WARNING",
        },
    },
}
