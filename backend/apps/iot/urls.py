from django.urls import path

from . import views

urlpatterns = [
    # Device management (JWT protected)
    path("devices/", views.DeviceListCreateView.as_view(), name="device-list-create"),
    path("devices/<int:pk>/", views.DeviceDetailView.as_view(), name="device-detail"),
    path("devices/<int:pk>/token/", views.DeviceTokenView.as_view(), name="device-token"),

    # Reading ingestion (Device-Token authenticated — for ESP32)
    path("readings/", views.IngestReadingView.as_view(), name="iot-ingest"),

    # Reading retrieval (JWT protected)
    path("readings/<str:device_id>/", views.ReadingListView.as_view(), name="reading-list"),
    path("readings/<str:device_id>/latest/", views.LatestReadingView.as_view(), name="reading-latest"),

    # Statistics (JWT protected)
    path("stats/<str:device_id>/", views.DeviceStatsView.as_view(), name="device-stats"),

    # Simulator control (JWT protected)
    path("devices/<int:pk>/simulate/", views.SimulatorView.as_view(), name="device-simulate"),
]
