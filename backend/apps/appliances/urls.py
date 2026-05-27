from django.urls import path

from . import views

urlpatterns = [
    # Built-in catalog
    path("catalog/", views.CatalogListView.as_view(), name="appliance-catalog"),

    # User's saved appliances (CRUD)
    path("", views.UserApplianceListCreateView.as_view(), name="appliance-list-create"),
    path("<int:pk>/", views.UserApplianceDetailView.as_view(), name="appliance-detail"),

    # Real-time analysis (no DB write)
    path("analyze/", views.AnalyzeAppliancesView.as_view(), name="appliance-analyze"),

    # Optimization: auto-adjust hours to meet budget (no DB write)
    path("optimize/", views.OptimizeAppliancesView.as_view(), name="appliance-optimize"),

    # Persist the optimized hours
    path("optimize/apply/", views.OptimizeApplyView.as_view(), name="appliance-optimize-apply"),
]
