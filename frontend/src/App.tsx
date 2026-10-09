import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { queryClient } from "./api/queryClient";
import { setSessionExpiredHandler } from "./api/client";
import { useCurrentUser, authKeys } from "./queries/useAuthQueries";
import { authStore, useAuthStore } from "./stores/auth.store";
import { isNativeApp } from "./lib/platform";
import { Skeleton } from "./components/ui/skeleton";
import AppErrorBoundary from "./components/common/AppErrorBoundary";
import { usePublicRouteTitle } from "./hooks/useRouteTitle";

import PublicLayout from "./layouts/PublicLayout";
import ProtectedRoute from "./router/ProtectedRoute";
import PublicOnlyRoute from "./router/PublicOnlyRoute";

import Home from "./pages/public/Home";

import { homePathForRole } from "./lib/roleHome";




// Every page except the landing page loads on demand, so a visitor to the
// public site doesn't download the whole admin and portal code first.
const PortalLayout = lazy(() => import("./layouts/PortalLayout"));
const PhotographerLayout = lazy(() => import("./layouts/PhotographerLayout"));
const AdminLayout = lazy(() => import("./layouts/AdminLayout"));
const About = lazy(() => import("./pages/public/About"));
const Features = lazy(() => import("./pages/public/Features"));
const Pricing = lazy(() => import("./pages/public/Pricing"));
const Gallery = lazy(() => import("./pages/public/Gallery"));
const FAQ = lazy(() => import("./pages/public/FAQ"));
const Contact = lazy(() => import("./pages/public/Contact"));
const Register = lazy(() => import("./pages/auth/Register"));
const Login = lazy(() => import("./pages/auth/Login"));
const VerifyMobile = lazy(() => import("./pages/auth/VerifyMobile"));
const ForgotPassword = lazy(() => import("./pages/auth/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/auth/ResetPassword"));
const AccountSettings = lazy(() => import("./pages/account/AccountSettings"));
const NotFound = lazy(() => import("./pages/public/NotFound"));
const RespondToInvitation = lazy(() => import("./pages/public/RespondToInvitation"));
const ScanEvent = lazy(() => import("./pages/public/ScanEvent"));
const PortalDashboard = lazy(() => import("./pages/portal/PortalDashboard"));
const GuestsHub = lazy(() => import("./pages/portal/GuestsHub"));
const EventsList = lazy(() => import("./pages/portal/events/EventsList"));
const EventCreate = lazy(() => import("./pages/portal/events/EventCreate"));
const EventDetail = lazy(() => import("./pages/portal/events/EventDetail"));
const EventEdit = lazy(() => import("./pages/portal/events/EventEdit"));
const EventGuests = lazy(() => import("./pages/portal/events/EventGuests"));
const EventInvitations = lazy(() => import("./pages/portal/events/EventInvitations"));
const EventGallery = lazy(() => import("./pages/portal/events/EventGallery"));
const EventQRCode = lazy(() => import("./pages/portal/events/EventQRCode"));
const InvitationTemplates = lazy(() => import("./pages/portal/InvitationTemplates"));
const Billing = lazy(() => import("./pages/portal/Billing"));
const ComingSoon = lazy(() => import("./pages/portal/ComingSoon"));
const PaymentSuccess = lazy(() => import("./pages/payment/PaymentSuccess"));
const PaymentCancelled = lazy(() => import("./pages/payment/PaymentCancelled"));
const PaymentTopupSuccess = lazy(() => import("./pages/payment/PaymentTopupSuccess"));
const PhotographerEvents = lazy(() => import("./pages/photographer/PhotographerEvents"));
const PhotographerEventUpload = lazy(() => import("./pages/photographer/PhotographerEventUpload"));
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const AdminUserManagement = lazy(() => import("./pages/admin/UserManagement"));
const AdminMembershipPlans = lazy(() => import("./pages/admin/MembershipPlans"));
const AdminInvitationTemplates = lazy(() => import("./pages/admin/InvitationTemplates"));
const AdminMediaManagement = lazy(() => import("./pages/admin/MediaManagement"));
const AdminChannelPools = lazy(() => import("./pages/admin/ChannelPools"));
const AdminTopupPacks = lazy(() => import("./pages/admin/TopupPacks"));
const AdminReports = lazy(() => import("./pages/admin/Reports"));

// Titles for the public / auth / payment pages. Portal, admin and
// photographer pages are titled by their own layout.
function PublicRouteTitle() {
  usePublicRouteTitle();
  return null;
}

function SessionBootstrap() {
  useCurrentUser();

  const rqClient = useQueryClient();

  useEffect(() => {
    setSessionExpiredHandler(() => {
      rqClient.setQueryData(authKeys.currentUser, null);
      authStore.setUser(null);
      authStore.setChecking(false);
    });
  }, [rqClient]);

  return null;
}

function AppSkeleton() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex h-16 items-center justify-between border-b border-slate-100 px-4 sm:px-6 lg:px-8">
        <Skeleton className="h-9 w-32" />
        <div className="hidden items-center gap-2 md:flex">
          <Skeleton className="h-9 w-20 rounded-full" />
          <Skeleton className="h-9 w-28 rounded-full" />
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-3">
          <Skeleton className="mx-auto h-10 w-10 rounded-full" />
          <Skeleton className="mx-auto h-4 w-40" />
          <Skeleton className="mx-auto h-4 w-28" />
        </div>
      </div>
    </div>
  );
}

function PublicOnlyForNonPhotographers({ children }: { children: ReactNode }) {
  const { user } = useAuthStore();

  if (user?.role === "PHOTOGRAPHER") {
    return <Navigate to="/photographer" replace />;
  }

  if (user?.role === "ADMIN") {
    return <Navigate to="/admin" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { isChecking, user } = useAuthStore();

  if (isChecking) {
    return <AppSkeleton />;
  }

  const nativeApp = isNativeApp();
  const fallbackPath = user ? homePathForRole(user.role) : "/login";

  return (
    <Suspense fallback={<AppSkeleton />}>
      <Routes>
        {!nativeApp && (
          <Route
            element={
              <PublicOnlyForNonPhotographers>
                <PublicLayout />
              </PublicOnlyForNonPhotographers>
            }
          >
            <Route index element={<Home />} />
            <Route path="about" element={<About />} />
            <Route path="features" element={<Features />} />
            <Route path="pricing" element={<Pricing />} />
            <Route path="gallery" element={<Gallery />} />
            <Route path="faq" element={<FAQ />} />
            <Route path="contact" element={<Contact />} />
          </Route>
        )}

        {nativeApp && <Route index element={<Navigate to={fallbackPath} replace />} />}

        <Route
          path="register"
          element={
            <PublicOnlyRoute>
              <Register />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="login"
          element={
            <PublicOnlyRoute>
              <Login />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="forgot-password"
          element={
            <PublicOnlyRoute>
              <ForgotPassword />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="reset-password"
          element={
            <PublicOnlyRoute>
              <ResetPassword />
            </PublicOnlyRoute>
          }
        />
        <Route path="verify-mobile" element={<VerifyMobile />} />

        <Route path="respond/:token" element={<RespondToInvitation />} />

        <Route path="scan/:token" element={<ScanEvent />} />

        <Route path="payment/success" element={<PaymentSuccess />} />
        <Route path="payment/cancelled" element={<PaymentCancelled />} />
        {/* Phase 26: dedicated landing for topup-pack purchases, separate
            from the plan-purchase success page since it polls a different
            status endpoint and shows pack info instead of plan info. */}
        <Route path="payment/topup-success" element={<PaymentTopupSuccess />} />

        <Route
          path="photographer"
          element={
            <ProtectedRoute allowedRoles={["PHOTOGRAPHER"]}>
              <PhotographerLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<PhotographerEvents />} />
          <Route path="events/:id" element={<PhotographerEventUpload />} />
          <Route path="settings" element={<AccountSettings />} />
        </Route>

        {/*
          Phase 26: added channel-pools (platform-wide pool monitoring +
          topup) and topup-packs (admin CRUD on the fixed packs organizers
          can buy) to the admin portal.
        */}
        <Route
          path="admin"
          element={
            <ProtectedRoute allowedRoles={["ADMIN"]}>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="users" element={<AdminUserManagement />} />
          <Route path="plans" element={<AdminMembershipPlans />} />
          <Route path="templates" element={<AdminInvitationTemplates />} />
          <Route path="media" element={<AdminMediaManagement />} />
          <Route path="channel-pools" element={<AdminChannelPools />} />
          <Route path="topup-packs" element={<AdminTopupPacks />} />
          <Route path="reports" element={<AdminReports />} />
          <Route path="settings" element={<AccountSettings />} />
        </Route>

        <Route
          path="portal"
          element={
            <ProtectedRoute allowedRoles={["ORGANIZER", "ADMIN"]}>
              <PortalLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<PortalDashboard />} />
          <Route path="guests" element={<GuestsHub />} />
          <Route path="events" element={<EventsList />} />
          <Route path="events/new" element={<EventCreate />} />
          <Route path="events/:id" element={<EventDetail />} />
          <Route path="events/:id/edit" element={<EventEdit />} />
          <Route path="events/:id/guests" element={<EventGuests />} />
          <Route path="events/:id/invitations" element={<EventInvitations />} />
          <Route path="events/:id/gallery" element={<EventGallery />} />
          <Route path="events/:id/qr-code" element={<EventQRCode />} />
          <Route path="templates" element={<InvitationTemplates />} />

          {/* Phase 26: organizer-facing usage dashboard + topup pack purchase flow. */}
          <Route path="billing" element={<Billing />} />

          <Route
            path="gallery"
            element={
              <ComingSoon
                title="Gallery"
                description="Open an event and use its Gallery tab to manage photos and videos."
              />
            }
          />
          <Route path="settings" element={<AccountSettings />} />
          <Route
            path="notifications"
            element={
              <ComingSoon
                title="Notifications"
                description="Your notifications will show up here once the notifications system is live."
              />
            }
          />
        </Route>

        {nativeApp ? (
          <Route path="*" element={<Navigate to={fallbackPath} replace />} />
        ) : (
          <Route path="*" element={<NotFound />} />
        )}
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SessionBootstrap />
        <PublicRouteTitle />
        <AppErrorBoundary>
          <AppRoutes />
        </AppErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;