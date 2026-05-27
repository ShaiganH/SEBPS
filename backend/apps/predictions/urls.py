from django.urls import path

from . import views

urlpatterns = [
    path("generate/",    views.GeneratePredictionView.as_view(), name="prediction-generate"),
    path("iot-status/",  views.IoTStatusView.as_view(),          name="prediction-iot-status"),
    path("",             views.PredictionListView.as_view(),      name="prediction-list"),
    path("latest/",      views.LatestPredictionView.as_view(),    name="prediction-latest"),
    path("<int:pk>/",         views.PredictionDetailView.as_view(), name="prediction-detail"),
    path("<int:pk>/compare/", views.ModelComparisonView.as_view(),  name="prediction-compare"),
]
