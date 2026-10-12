from django.urls import path

from .views import (
    AdminReviewDetailView,
    AdminReviewListView,
    AdminReviewMarkAllReadView,
    PublicReviewsView,
)

urlpatterns = [
    # Public: list published reviews / submit a new one.
    path("reviews/", PublicReviewsView.as_view(), name="reviews-public"),

    # Admin moderation.
    path("admin-panel/reviews/", AdminReviewListView.as_view(), name="admin-review-list"),
    path("admin-panel/reviews/mark-all-read/", AdminReviewMarkAllReadView.as_view(), name="admin-review-mark-all-read"),
    path("admin-panel/reviews/<int:review_pk>/", AdminReviewDetailView.as_view(), name="admin-review-detail"),
]