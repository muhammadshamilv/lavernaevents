import { Navigate, Outlet } from "react-router-dom";
import { usePortalAccess } from "@/queries/useMembershipQueries";
import { useAuthStore } from "@/stores/auth.store";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { PortalBottomNav, PortalSidebar, PortalTopBar } from "@/components/portal/PortalNav";
import { Toaster } from "@/components/ui/toaster";
import { useRouteTitle } from "@/hooks/useRouteTitle";

function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[var(--brand-navy)] focus:shadow-lg"
    >
      Skip to content
    </a>
  );
}

function PortalLayoutSkeleton() {
  return (
    <div className="gradient-mesh-subtle flex min-h-screen items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <Card className="p-8 sm:p-10">
          <Skeleton className="mx-auto h-4 w-32" />
          <Skeleton className="mx-auto mt-4 h-7 w-56" />
          <Skeleton className="mx-auto mt-3 h-4 w-72" />
          <div className="mt-8 space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </Card>
      </div>
    </div>
  );
}

// The authenticated app shell - sidebar on desktop, top bar + bottom tabs
// on mobile. This is a genuine JS branch (isDesktop ? treeA : treeB), so
// only ONE navigation tree is ever mounted in the DOM at a time - never
// two trees hidden/shown with CSS classes. That CSS-split pattern is what
// caused the earlier dual-mounted-form bug on Login/Register/EventForm,
// and here it's what was producing the leftover sidebar sliver on mobile:
// a `hidden md:flex` sidebar still occupies layout space on some mobile
// viewports/zoom levels even while visually hidden, because it's still
// part of the DOM. A JS conditional never has that problem - the sidebar
// literally doesn't exist in the tree on mobile.
export default function PortalLayout() {
  const { user } = useAuthStore();
  const isDesktop = useIsDesktop();
  useRouteTitle("portal");

  // usePortalAccess() is called unconditionally (required - hooks can't
  // be called conditionally), but its result is ignored below for a
  // photographer: portal-access is a membership/subscription concept
  // that only applies to organizers. GET /memberships/portal-access/ has
  // no role check of its own on the backend, so for a photographer it
  // would return a nonsensical "next_step: select_plan" (sending a
  // photographer to /pricing to buy an event-organizer subscription).
  // The isPhotographer check below runs before that result is ever acted
  // on, so it never actually redirects anywhere based on it.
  // PhotographerLayout has the mirror-image check.
  const { data: access, isLoading, isError } = usePortalAccess();

  const isPhotographer = user?.role === "PHOTOGRAPHER";

  if (isPhotographer) {
    return <Navigate to="/photographer" replace />;
  }

  if (isLoading) {
    return <PortalLayoutSkeleton />;
  }

  if (isError || !access) {
    return (
      <div className="gradient-mesh-subtle flex min-h-screen items-center justify-center px-4 py-16">
        <Card className="max-w-md p-8 text-center">
          <p className="text-sm text-slate-500">
            We couldn't check your portal access right now. Please refresh the page.
          </p>
        </Card>
      </div>
    );
  }

  if (access.next_step === "verify_mobile") {
    const mobileParam = user?.mobile_number
      ? `?mobile=${encodeURIComponent(user.mobile_number)}`
      : "";
    return <Navigate to={`/verify-mobile${mobileParam}`} replace />;
  }

  if (access.next_step === "select_plan") {
    return <Navigate to="/pricing" replace />;
  }

  if (isDesktop) {
    return (
      <div className="flex min-h-screen bg-slate-50/70">
        <SkipLink />
        <PortalSidebar />
        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 overflow-y-auto focus:outline-none">
          <Outlet />
        </main>
        <Toaster />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50/70">
      <SkipLink />
      <PortalTopBar />
      <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 pb-24 focus:outline-none">
        <Outlet />
      </main>
      <PortalBottomNav />
      <Toaster />
    </div>
  );
}