import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/auth.store";
import { homePathForRole } from "@/lib/roleHome";
import type { UserRole } from "@/types/auth.types";

interface ProtectedRouteProps {
  children: ReactNode;
  /** When given, only these roles may open the route; others are sent to
   *  their own home instead of seeing another role's portal. */
  allowedRoles?: UserRole[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, isChecking } = useAuthStore();
  const location = useLocation();

  if (isChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--brand-pink)] border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Signed in but the mobile number was never confirmed: finish that first.
  if (!user.is_verified && user.role !== "ADMIN") {
    return (
      <Navigate
        to={`/verify-mobile?mobile=${encodeURIComponent(user.mobile_number)}`}
        replace
      />
    );
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={homePathForRole(user.role)} replace />;
  }

  return <>{children}</>;
}