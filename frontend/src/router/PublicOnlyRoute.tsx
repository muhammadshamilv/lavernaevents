import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth.store";
import { homePathForRole } from "@/lib/roleHome";

interface PublicOnlyRouteProps {
  children: ReactNode;
}

export default function PublicOnlyRoute({ children }: PublicOnlyRouteProps) {
  const { user, isChecking } = useAuthStore();

  if (isChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--brand-pink)] border-t-transparent" />
      </div>
    );
  }

  // A signed-in but unverified user is allowed to see /login again
  // (e.g. to switch account); everyone else goes to their own portal.
  if (user && (user.is_verified || user.role === "ADMIN")) {
    return <Navigate to={homePathForRole(user.role)} replace />;
  }

  return <>{children}</>;
}