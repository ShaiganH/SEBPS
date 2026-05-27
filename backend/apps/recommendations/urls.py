from django.urls import path

from . import views

urlpatterns = [
    path("generate/", views.GenerateRecommendationView.as_view(), name="recommendation-generate"),
    path("smart/", views.SmartRecommendationView.as_view(), name="recommendation-smart"),
    path("", views.RecommendationListView.as_view(), name="recommendation-list"),
    path("<int:pk>/", views.RecommendationDetailView.as_view(), name="recommendation-detail"),
    path("<int:pk>/apply/", views.ApplyReductionsView.as_view(), name="recommendation-apply"),
]
