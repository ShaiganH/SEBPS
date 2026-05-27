from django.urls import path

from . import views

urlpatterns = [
    path("", views.BudgetView.as_view(), name="budget"),
    path("update/", views.BudgetUpdateView.as_view(), name="budget-update"),
    path("alerts/", views.BudgetAlertsView.as_view(), name="budget-alerts"),
    path("history/", views.BudgetHistoryView.as_view(), name="budget-history"),
]
