import logging

from django.http import StreamingHttpResponse
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.appliances.models import UserAppliance
from apps.bills.models import BillRecord
from apps.budget.models import Budget
from apps.predictions.models import Prediction
from services.chatbot_service import build_user_context, stream_chat, sync_chat

from .models import ChatMessage, ChatSession
from .serializers import (
    ChatSessionListSerializer,
    ChatSessionSerializer,
    SendMessageSerializer,
)

logger = logging.getLogger(__name__)


def _build_context(user):
    history_data = None
    bills = BillRecord.objects.filter(user=user).order_by("year", "mon_idx")
    if bills.exists():
        rows = [
            {"month": b.month_label, "units": b.units, "bill": int(b.bill_amount)}
            for b in bills
        ]
        history_data = {
            "history_units": [b.units for b in bills],
            "raw_rows": rows,
        }

    prediction_data = None
    pred = Prediction.objects.filter(user=user).first()
    if pred:
        prediction_data = pred.result

    appliances = [
        {
            "name": a.name,
            "wattage_w": a.wattage_w,
            "hours_per_day": a.hours_per_day,
            "quantity": a.quantity,
            "category": a.category,
        }
        for a in UserAppliance.objects.filter(user=user, is_active=True)
    ]

    budget = getattr(user, "budget", None)

    return build_user_context(
        ref_no=user.ref_no,
        bill_kwargs=user.bill_kwargs,
        history_data=history_data,
        prediction=prediction_data,
        appliances=appliances,
        budget_pkr=float(budget.max_pkr) if budget else None,
        budget_units=budget.max_units if budget else None,
    )


class SendMessageView(APIView):
    """POST /api/v1/chatbot/message/ — send a message, get AI response."""

    def post(self, request):
        serializer = SendMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = request.user

        # Get or create session
        if "session_id" in data:
            session = generics.get_object_or_404(ChatSession, pk=data["session_id"], user=user)
        else:
            session = ChatSession.objects.create(
                user=user,
                title=data["message"][:80],
            )

        # Persist user message
        ChatMessage.objects.create(session=session, role="user", content=data["message"])

        # Build conversation history for Groq
        history = [
            {"role": msg.role, "content": msg.content}
            for msg in session.messages.all()
        ]

        context = _build_context(user)

        if data.get("stream"):
            def generate():
                full_response = ""
                try:
                    for chunk in stream_chat(history, context):
                        full_response += chunk
                        yield f"data: {chunk}\n\n"
                finally:
                    if full_response:
                        ChatMessage.objects.create(
                            session=session, role="assistant", content=full_response
                        )
                        session.title = session.title or data["message"][:80]
                        session.save(update_fields=["updated_at"])

            return StreamingHttpResponse(generate(), content_type="text/event-stream")

        # Non-streaming
        reply = sync_chat(history, context)
        ChatMessage.objects.create(session=session, role="assistant", content=reply)

        return Response(
            {
                "session_id": session.id,
                "message": reply,
                "role": "assistant",
            },
            status=status.HTTP_200_OK,
        )


class SessionListView(generics.ListAPIView):
    serializer_class = ChatSessionListSerializer

    def get_queryset(self):
        return ChatSession.objects.filter(user=self.request.user)


class SessionDetailView(generics.RetrieveDestroyAPIView):
    serializer_class = ChatSessionSerializer

    def get_queryset(self):
        return ChatSession.objects.filter(user=self.request.user)

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active"])


class StarterPromptsView(APIView):
    """GET /api/v1/chatbot/starters/ — return suggested conversation starters."""

    def get(self, request):
        from services.chatbot_service import STARTER_PROMPTS
        return Response({"starters": STARTER_PROMPTS})
