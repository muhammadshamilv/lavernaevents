import type { UserRole } from "@/types/auth.types";

/** The landing page for each role after sign-in. */
export function homePathForRole(role?: UserRole | null): string {
  switch (role) {
    case "ADMIN":
      return "/admin";
    case "PHOTOGRAPHER":
      return "/photographer";
    case "ORGANIZER":
      return "/portal";
    default:
      return "/";
  }
}