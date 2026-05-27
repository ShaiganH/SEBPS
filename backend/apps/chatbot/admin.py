from django.contrib import admin

from .models import ChatMessage, ChatSession


class ChatMessageInline(admin.TabularInline):
    model = ChatMessage
    extra = 0
    readonly_fields = ["role", "content", "created_at"]


@admin.register(ChatSession)
class ChatSessionAdmin(admin.ModelAdmin):
    list_display = ["user", "title", "is_active", "created_at"]
    list_filter = ["is_active"]
    search_fields = ["user__email", "title"]
    inlines = [ChatMessageInline]
