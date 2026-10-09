import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { LogOut, Menu, X } from "lucide-react";
import logo from "@/assets/laverna-logo.png";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/stores/auth.store";
import { useLogoutMutation } from "@/queries/useAuthQueries";
import { usePortalAccess } from "@/queries/useMembershipQueries";
import { NAV_LINKS } from "@/lib/siteConfig";
import { cn } from "@/lib/utils";

// A logged-in user stays on the public site until they choose to enter
// the portal - "Open portal" is a deliberate click, never an automatic
// redirect. Where that click goes depends on portal access: not yet
// subscribed -> /pricing to complete purchase first; fully onboarded ->
// straight into /portal. usePortalAccess is the same single source of
// truth PortalLayout's own gate uses, so this never drifts out of sync.
function usePortalDestination(): string {
  const { data: access } = usePortalAccess();
  return access?.can_access_portal ? "/portal" : "/pricing";
}

function useSignOut(onNavigate?: () => void) {
  const logoutMutation = useLogoutMutation();
  const navigate = useNavigate();

  const signOut = async () => {
    onNavigate?.();
    try {
      await logoutMutation.mutateAsync();
    } finally {
      navigate("/login", { replace: true });
    }
  };

  return { signOut, isPending: logoutMutation.isPending };
}

function AccountMenu() {
  const { user } = useAuthStore();
  const portalDestination = usePortalDestination();
  const { signOut, isPending } = useSignOut();

  const initial = user?.full_name?.trim()?.[0]?.toUpperCase() ?? "?";

  return (
    <div className="flex items-center gap-2">
      <Link to={portalDestination} className={buttonVariants({ variant: "primary", size: "sm" })}>
        Open portal
      </Link>

      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-navy)] text-sm font-semibold text-white"
        title={user?.full_name}
      >
        {initial}
      </div>

      <button
        type="button"
        onClick={signOut}
        disabled={isPending}
        className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
        aria-label="Sign out"
        title="Sign out"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}

function MobileAccountMenu({ onNavigate }: { onNavigate: () => void }) {
  const { user } = useAuthStore();
  const portalDestination = usePortalDestination();
  const { signOut, isPending } = useSignOut(onNavigate);

  const initial = user?.full_name?.trim()?.[0]?.toUpperCase() ?? "?";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 rounded-xl px-3 py-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-navy)] text-sm font-semibold text-white">
          {initial}
        </div>
        <p className="truncate text-sm font-medium text-[var(--brand-navy)]">{user?.full_name ?? "Account"}</p>
      </div>

      <Link
        to={portalDestination}
        onClick={onNavigate}
        className={buttonVariants({ variant: "primary", className: "w-full" })}
      >
        Open portal
      </Link>

      <button
        type="button"
        onClick={signOut}
        disabled={isPending}
        className="flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 px-4 py-2.5 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
      >
        <LogOut className="h-4 w-4" />
        {isPending ? "Signing out..." : "Sign out"}
      </button>
    </div>
  );
}

const desktopLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "relative rounded-full px-3.5 py-2 text-sm font-medium text-slate-600 transition-colors hover:text-[var(--brand-navy)] lg:px-4",
    isActive && "text-[var(--brand-navy)] after:absolute after:inset-x-4 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-[var(--brand-pink)]"
  );

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { user, isChecking } = useAuthStore();
  const { pathname } = useLocation();

  // Close the mobile menu whenever the page changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b bg-white/85 backdrop-blur-md transition-shadow",
        scrolled ? "border-slate-200/80 shadow-[0_8px_24px_-16px_rgba(36,21,66,0.25)]" : "border-slate-100"
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex shrink-0 items-center gap-2" aria-label="LavernaEvents home">
          <img src={logo} alt="LavernaEvents" className="h-9 w-auto object-contain" />
        </Link>

        <nav aria-label="Main" className="hidden items-center md:flex">
          {NAV_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} className={desktopLinkClass}>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {isChecking ? (
            <>
              <Skeleton className="h-9 w-16 rounded-full" />
              <Skeleton className="h-9 w-24 rounded-full" />
            </>
          ) : user ? (
            <AccountMenu />
          ) : (
            <>
              <Link to="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Log in
              </Link>
              <Link to="/register" className={buttonVariants({ variant: "primary", size: "sm" })}>
                Get started
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--brand-navy)] transition-colors hover:bg-slate-100 md:hidden"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <>
            {/* Tap outside the menu to close it. Absolute (not fixed): the header's backdrop-blur makes it the containing block for fixed children. */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeMenu}
              className="absolute inset-x-0 top-full h-[100dvh] bg-slate-900/30 md:hidden"
              aria-hidden="true"
            />
            <motion.div
              id="mobile-menu"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-slate-100 bg-white md:hidden"
            >
              <nav aria-label="Mobile" className="flex flex-col gap-1 px-4 py-4">
                {[{ to: "/", label: "Home" }, ...NAV_LINKS].map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    end={link.to === "/"}
                    onClick={closeMenu}
                    className={({ isActive }) =>
                      cn(
                        "rounded-xl px-4 py-3 text-base font-medium text-slate-600 transition-colors hover:bg-slate-100",
                        isActive && "bg-[var(--brand-pink)]/8 text-[var(--brand-pink)]"
                      )
                    }
                  >
                    {link.label}
                  </NavLink>
                ))}

                <div className="mt-2 flex flex-col gap-2 border-t border-slate-100 pt-4">
                  {isChecking ? (
                    <>
                      <Skeleton className="h-11 w-full rounded-full" />
                      <Skeleton className="h-11 w-full rounded-full" />
                    </>
                  ) : user ? (
                    <MobileAccountMenu onNavigate={closeMenu} />
                  ) : (
                    <>
                      <Link
                        to="/login"
                        onClick={closeMenu}
                        className={buttonVariants({ variant: "outline", className: "w-full" })}
                      >
                        Log in
                      </Link>
                      <Link
                        to="/register"
                        onClick={closeMenu}
                        className={buttonVariants({ variant: "primary", className: "w-full" })}
                      >
                        Get started
                      </Link>
                    </>
                  )}
                </div>
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}