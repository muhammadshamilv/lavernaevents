from django.contrib import admin

from .models import FaceEmbedding, GalleryMedia


@admin.register(GalleryMedia)
class GalleryMediaAdmin(admin.ModelAdmin):
    list_display = ("event", "media_type", "face_scan_status", "is_featured", "uploaded_by", "file_size", "created_at")
    list_filter = ("media_type", "face_scan_status", "is_featured")
    search_fields = ("event__name", "caption")
    autocomplete_fields = ("event", "uploaded_by")
    readonly_fields = ("face_scan_status", "file_size", "created_at", "updated_at")
    actions = ("queue_for_face_scan",)

    @admin.action(description="Scan the selected photos for faces again")
    def queue_for_face_scan(self, request, queryset):
        """Put photos back in the face-scan queue. The next upload, the
        organizer's "Scan again" button or `manage.py scan_faces` then
        processes them (old results are replaced, never duplicated)."""

        queued = queryset.filter(media_type=GalleryMedia.MediaType.IMAGE).update(
            face_scan_status=GalleryMedia.FaceScanStatus.PENDING
        )
        self.message_user(request, f"{queued} photo(s) queued for a fresh face scan.")


@admin.register(FaceEmbedding)
class FaceEmbeddingAdmin(admin.ModelAdmin):
    """Read-only: embeddings are created only by gallery.face_scan, never by hand."""

    list_display = ("media", "created_at")
    search_fields = ("media__event__name",)
    autocomplete_fields = ("media",)
    readonly_fields = ("media", "encoding_json", "created_at", "updated_at")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
