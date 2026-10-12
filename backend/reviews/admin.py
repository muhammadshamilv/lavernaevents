from django.contrib import admin

from .models import Review


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ("name", "rating", "is_read", "is_published", "created_at")
    list_filter = ("is_published", "is_read", "rating")
    search_fields = ("name", "message")