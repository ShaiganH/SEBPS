"""
Bridge to module_5_chatbot/chatbot.py.
"""

import logging
import os

from django.conf import settings

logger = logging.getLogger(__name__)

STARTER_PROMPTS = [
    "What is my biggest electricity expense and how can I reduce it?",
    "Am I close to a slab boundary? What would I save by dropping below it?",
    "Which appliances should I cut first to meet my budget?",
    "Show me a comparison of my monthly usage — am I using more than usual?",
    "Give me a week-by-week action plan to reduce my bill by 20%.",
    "What time of day should I run my AC to save the most?",
]


def build_user_context(
    ref_no=None,
    bill_kwargs=None,
    history_data=None,
    prediction=None,
    appliances=None,
    budget_pkr=None,
    budget_units=None,
) -> dict:
    try:
        from chatbot import build_context  # module_5_chatbot/chatbot.py
        # Ensure GROQ_API_KEY is available in environment
        os.environ.setdefault("GROQ_API_KEY", settings.GROQ_API_KEY)
        return build_context(
            ref_no=ref_no,
            bill_kwargs=bill_kwargs,
            history_data=history_data,
            prediction=prediction,
            appliances=appliances,
            budget_pkr=budget_pkr,
            budget_units=budget_units,
        )
    except ImportError:
        logger.error("Chatbot module not found.")
        return {}


def stream_chat(messages: list, context: dict):
    """Generator yielding text chunks for SSE streaming."""
    try:
        os.environ.setdefault("GROQ_API_KEY", settings.GROQ_API_KEY)
        from chatbot import chat  # module_5_chatbot/chatbot.py
        yield from chat(messages=messages, context=context, stream=True)
    except ImportError:
        logger.error("Chatbot module not found.")
        yield "Chatbot service unavailable. Please check server configuration."


def sync_chat(messages: list, context: dict) -> str:
    """Non-streaming chat — returns full response string."""
    try:
        os.environ.setdefault("GROQ_API_KEY", settings.GROQ_API_KEY)
        from chatbot import chat
        return chat(messages=messages, context=context, stream=False)
    except ImportError:
        logger.error("Chatbot module not found.")
        return "Chatbot service unavailable."
