from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView

api_v1 = [
    path("auth/", include("apps.accounts.urls")),
    path("ocr/", include("apps.ocr.urls")),
    path("bills/", include("apps.bills.urls")),
    path("predictions/", include("apps.predictions.urls")),
    path("iot/", include("apps.iot.urls")),
    path("appliances/", include("apps.appliances.urls")),
    path("budget/", include("apps.budget.urls")),
    path("recommendations/", include("apps.recommendations.urls")),
    path("chatbot/", include("apps.chatbot.urls")),
    path("notifications/", include("apps.notifications.urls")),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path("docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
]

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include(api_v1)),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
