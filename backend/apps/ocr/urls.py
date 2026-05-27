from django.urls import path

from . import views

urlpatterns = [
    # Step 1: upload image → start OCR
    path("upload/", views.OCRUploadView.as_view(), name="ocr-upload"),
    # Step 2: poll until complete
    path("status/<int:pk>/", views.OCRJobStatusView.as_view(), name="ocr-status"),
    # Step 3: user confirms/corrects ref_no → triggers LESCO fetch
    path("<int:pk>/confirm/", views.OCRConfirmView.as_view(), name="ocr-confirm"),
    # History
    path("history/", views.OCRHistoryView.as_view(), name="ocr-history"),
]
