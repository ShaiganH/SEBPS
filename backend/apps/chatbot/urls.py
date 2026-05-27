from django.urls import path

from . import views

urlpatterns = [
    path("message/", views.SendMessageView.as_view(), name="chatbot-message"),
    path("sessions/", views.SessionListView.as_view(), name="chatbot-sessions"),
    path("sessions/<int:pk>/", views.SessionDetailView.as_view(), name="chatbot-session-detail"),
    path("starters/", views.StarterPromptsView.as_view(), name="chatbot-starters"),
]
