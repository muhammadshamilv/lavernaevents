from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import IsAdminRole

from .models import Review
from .serializers import AdminReviewSerializer, PublicReviewSerializer, ReviewCreateSerializer
from .services import PUBLIC_LIMIT, ReviewRejected, admin_counts, published_summary, submit_review

ADMIN_LIST_LIMIT = 200


def _ok(message: str, data=None, code=status.HTTP_200_OK) -> Response:
    return Response({"success": True, "message": message, "data": {} if data is None else data}, status=code)


def _invalid(message: str, errors, code=status.HTTP_400_BAD_REQUEST) -> Response:
    return Response({"success": False, "message": message, "errors": errors}, status=code)


class PublicReviewsView(APIView):
    """GET: the published reviews. POST: a visitor submits one.

    Open to everyone, so it ignores any login cookie (an expired cookie must
    not turn a public page into a 401).
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request):
        reviews = Review.objects.filter(is_published=True)[:PUBLIC_LIMIT]

        return _ok(
            "Reviews retrieved successfully.",
            {
                "results": PublicReviewSerializer(reviews, many=True).data,
                **published_summary(),
            },
        )

    def post(self, request):
        serializer = ReviewCreateSerializer(data=request.data)

        if not serializer.is_valid():
            return _invalid("Please check your review and try again.", serializer.errors)

        data = serializer.validated_data

        # Honeypot: a person never sees this field. Pretend it worked so the
        # bot learns nothing, and store nothing.
        if data.get("website"):
            return _ok("Thank you! Your review is waiting for approval.", code=status.HTTP_201_CREATED)

        try:
            submit_review(
                name=data["name"],
                title=data.get("title", ""),
                rating=data["rating"],
                message=data["message"],
            )
        except ReviewRejected as error:
            return _invalid(error.message, {"detail": [error.message]}, code=status.HTTP_429_TOO_MANY_REQUESTS)

        return _ok("Thank you! Your review is waiting for approval.", code=status.HTTP_201_CREATED)


class AdminReviewsAPIView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]


class AdminReviewListView(AdminReviewsAPIView):
    """Every review, newest first, with counts for the filter tabs.

    ?status=new (unread) | published | hidden | all (default)
    ?rating=1..5   ?search=text   ?limit=0..200
    """

    def get(self, request):
        queryset = Review.objects.all()
        params = request.query_params

        state = (params.get("status") or "all").lower()
        if state == "new":
            queryset = queryset.filter(is_read=False)
        elif state == "published":
            queryset = queryset.filter(is_published=True)
        elif state == "hidden":
            queryset = queryset.filter(is_published=False)

        rating = params.get("rating")
        if rating and rating.isdigit() and 1 <= int(rating) <= 5:
            queryset = queryset.filter(rating=int(rating))

        search = (params.get("search") or "").strip()
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) | Q(title__icontains=search) | Q(message__icontains=search)
            )

        # ?limit=0 returns only the counts (the sidebar badge uses this).
        limit = ADMIN_LIST_LIMIT
        raw_limit = params.get("limit")
        if raw_limit and raw_limit.isdigit():
            limit = min(int(raw_limit), ADMIN_LIST_LIMIT)

        return _ok(
            "Reviews retrieved successfully.",
            {
                "results": AdminReviewSerializer(queryset[:limit], many=True).data if limit else [],
                "counts": admin_counts(),
            },
        )


class AdminReviewDetailView(AdminReviewsAPIView):
    def patch(self, request, review_pk):
        review = get_object_or_404(Review, pk=review_pk)
        serializer = AdminReviewSerializer(review, data=request.data, partial=True)

        if not serializer.is_valid():
            return _invalid("Review update failed.", serializer.errors)

        review = serializer.save()

        # Publishing a review means an admin has read it.
        if review.is_published and not review.is_read:
            review.is_read = True
            review.save(update_fields=["is_read", "updated_at"])

        return _ok("Review updated successfully.", AdminReviewSerializer(review).data)

    def delete(self, request, review_pk):
        get_object_or_404(Review, pk=review_pk).delete()

        return _ok("Review deleted successfully.")


class AdminReviewMarkAllReadView(AdminReviewsAPIView):
    def post(self, request):
        updated = Review.objects.filter(is_read=False).update(is_read=True)

        return _ok("All reviews marked as read.", {"updated": updated})