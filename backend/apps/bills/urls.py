from django.urls import path

from . import views

urlpatterns = [
    path("", views.BillListView.as_view(), name="bill-list"),
    path("<int:pk>/", views.BillDetailView.as_view(), name="bill-detail"),
    path("manual/", views.ManualBillCreateView.as_view(), name="bill-manual-create"),
    path("fetch/", views.TriggerFetchView.as_view(), name="bill-fetch-trigger"),
    path("fetch/<int:pk>/", views.FetchJobStatusView.as_view(), name="bill-fetch-status"),
    path("fetch/jobs/", views.FetchJobListView.as_view(), name="bill-fetch-jobs"),
]
