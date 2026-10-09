import { useAuthStore } from "@/stores/auth.store";

// The main call to action adapts to whether the visitor is signed in, so the
// public pages never ask a logged-in organizer to "Get started" again.
export function usePrimaryCta() {
  const { user } = useAuthStore();

  return {
    isSignedIn: !!user,
    primaryHref: user ? "/portal" : "/register",
    primaryLabel: user ? "Open portal" : "Get started",
    secondaryHref: user ? "/pricing" : "/login",
    secondaryLabel: user ? "View plans" : "Log in",
  };
}