import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "@/stores/auth.store";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { AdminBottomNav, AdminSidebar, AdminTopBar } from "@/components/admin/AdminNav";
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

// Mirrors layouts/PortalLayout.tsx's shape: ONE tree mounted at a time via
// a genuine JS conditional (never a CSS-hidden duplicate - see PortalLayout's
// own comment for why that anti-pattern was banned project-wide).
//
// Simpler than PortalLayout in one respect: there's no membership/
// portal-access gate here (admins don't subscribe to plans), so the only
// gate is the role check below. Any non-ADMIN user who somehow lands on
// /admin (e.g. typing the URL directly) is redirected to their own home -
// ORGANIZER/GUEST to /portal, PHOTOGRAPHER to /photographer - exactly
// mirroring the existing mutual-redirect pattern between those two trees.
export default function AdminLayout() {
  const { user } = useAuthStore();
  const isDesktop = useIsDesktop();
  useRouteTitle("admin");

  if (user?.role === "PHOTOGRAPHER") {
    return <Navigate to="/photographer" replace />;
  }

  if (user?.role !== "ADMIN") {
    return <Navigate to="/portal" replace />;
  }

  if (isDesktop) {
    return (
      <div className="flex min-h-screen bg-slate-50/70">
        <SkipLink />
        <AdminSidebar />
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
      <AdminTopBar />
      <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 pb-24 focus:outline-none">
        <Outlet />
      </main>
      <AdminBottomNav />
      <Toaster />
    </div>
  );
}