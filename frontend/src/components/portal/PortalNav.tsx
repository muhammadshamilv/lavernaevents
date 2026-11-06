import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { AnimatePresence, LayoutGroup, MotionConfig, motion, type PanInfo } from "framer-motion";
import {
  CalendarDays,
  CalendarPlus,
  ChevronRight,
  CreditCard,
  Home,
  Image as ImageIcon,
  LogOut,
  Mail,
  Menu,
  Settings,
  Users,
  X,
  Bell,
} from "lucide-react";
import Logo from "@/components/brand/Logo";
import { Spinner } from "@/components/ui/spinner";
import { useAuthStore } from "@/stores/auth.store";
import { useLogoutMutation } from "@/queries/useAuthQueries";
import { cn } from "@/lib/utils";

// Closes an overlay when Escape is pressed.
function useEscapeToClose(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}

// Single source of truth for every portal destination. Desktop's sidebar
// and mobile's floating dock both read from this one list, so a new
// destination is added once here and shows up correctly on both surfaces.
const NAV_ITEMS = [
  { to: "/portal", label: "Dashboard", shortLabel: "Home", icon: Home, end: true },
  { to: "/portal/events", label: "Events", shortLabel: "Events", icon: CalendarDays, end: false },
  { to: "/portal/guests", label: "Guests", shortLabel: "Guests", icon: Users, end: false },
  { to: "/portal/templates", label: "Templates", shortLabel: "Templates", icon: Mail, end: false },
  { to: "/portal/gallery", label: "Gallery", shortLabel: "Gallery", icon: ImageIcon, end: false },
  { to: "/portal/billing", label: "Billing", shortLabel: "Billing", icon: CreditCard, end: false },
];

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-pink)]/40",
    isActive
      ? "bg-gradient-to-r from-[var(--brand-pink)]/12 to-[var(--brand-pink)]/[0.03] font-semibold text-[var(--brand-pink)] before:absolute before:left-0 before:top-1/2 before:h-6 before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-[var(--brand-pink)]"
      : "text-slate-600 hover:bg-slate-100 hover:text-[var(--brand-navy)] [@media(hover:hover)]:hover:translate-x-0.5"
  );

// Desktop sidebar footer: Settings, the signed-in person, Sign out.
function AccountBlock({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuthStore();
  const logoutMutation = useLogoutMutation();

  const initial = user?.full_name?.trim()?.[0]?.toUpperCase() ?? "?";

  const handleLogout = () => {
    onNavigate?.();
    logoutMutation.mutate();
  };

  return (
    <>
      <NavLink to="/portal/settings" className={navLinkClass} onClick={onNavigate}>
        <Settings className="h-4 w-4" />
        Settings
      </NavLink>

      <div className="mt-3 flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[image:var(--gradient-brand)] text-sm font-semibold text-white shadow-sm">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--brand-navy)]">
            {user?.full_name ?? "Account"}
          </p>
          <p className="truncate text-xs text-slate-400">{user?.mobile_number}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={handleLogout}
        disabled={logoutMutation.isPending}
        className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 transition-all duration-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
      >
        {logoutMutation.isPending ? <Spinner size="xs" decorative /> : <LogOut className="h-4 w-4" />}
        {logoutMutation.isPending ? "Signing out..." : "Sign out"}
      </button>
    </>
  );
}

export function PortalSidebar() {
  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-slate-100 bg-white shadow-[1px_0_0_0_rgba(36,21,66,0.02)]">
      <div className="flex h-16 items-center border-b border-slate-100 px-6">
        <Link to="/portal" aria-label="LavernaEvents dashboard">
          <Logo size="md" />
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Portal">
        <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Menu</p>
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-100 p-3">
        <AccountBlock />
      </div>
    </aside>
  );
}

// Mobile side menu: slides in from the left. Profile, account links,
// shortcuts and Sign out - the things that are not main features.
function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuthStore();
  const logoutMutation = useLogoutMutation();
  const { pathname } = useLocation();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const initial = user?.full_name?.trim()?.[0]?.toUpperCase() ?? "?";

  useEscapeToClose(open, onClose);

  // Close after moving to another page.
  const firstPath = useRef(pathname);
  useEffect(() => {
    if (firstPath.current !== pathname) {
      firstPath.current = pathname;
      onClose();
    }
  }, [pathname, onClose]);

  // Keep the page behind from scrolling while the menu is open, and put
  // keyboard focus inside the menu.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const handleLogout = () => {
    onClose();
    logoutMutation.mutate();
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -80 || info.velocity.x < -500) onClose();
  };

  const rowClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex min-h-12 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition-colors active:scale-[0.98]",
      isActive ? "bg-[var(--brand-pink)]/10 text-[var(--brand-pink)]" : "text-[var(--brand-navy)] hover:bg-slate-50"
    );

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60] bg-[var(--brand-navy)]/45 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0.4, right: 0 }}
            onDragEnd={onDragEnd}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="fixed inset-y-0 left-0 z-[61] flex w-[min(86vw,320px)] flex-col overflow-y-auto rounded-r-[2rem] bg-white shadow-[20px_0_50px_-20px_rgba(36,21,66,0.4)]"
            style={{
              paddingTop: "var(--safe-area-inset-top)",
              paddingBottom: "calc(1rem + var(--safe-area-inset-bottom))",
            }}
          >
            <div className="relative m-3 overflow-hidden rounded-3xl bg-[image:var(--gradient-brand)] p-4 text-white shadow-lg">
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label="Close menu"
                className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 text-xl font-bold ring-2 ring-white/40">
                {initial}
              </div>
              <p className="mt-3 truncate pr-8 text-base font-semibold">{user?.full_name ?? "Account"}</p>
              <p className="truncate text-xs text-white/75">{user?.mobile_number}</p>
            </div>

            <nav className="flex-1 px-3" aria-label="Account menu">
              <p className="px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Account
              </p>
              <NavLink to="/portal/settings" className={rowClass}>
                <Settings className="h-5 w-5" />
                <span className="flex-1">Account settings</span>
                <ChevronRight className="h-4 w-4 text-slate-300" />
              </NavLink>
              <div
                aria-disabled="true"
                className="flex min-h-12 items-center gap-3 rounded-2xl px-3 text-sm font-semibold text-slate-400"
              >
                <Bell className="h-5 w-5" />
                <span className="flex-1">Notifications</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Soon
                </span>
              </div>

              <p className="px-3 pb-1.5 pt-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Shortcuts
              </p>
              <NavLink to="/portal/events/new" end className={rowClass}>
                <CalendarPlus className="h-5 w-5" />
                <span className="flex-1">New event</span>
                <ChevronRight className="h-4 w-4 text-slate-300" />
              </NavLink>
              <NavLink to="/portal/billing" className={rowClass}>
                <CreditCard className="h-5 w-5" />
                <span className="flex-1">Billing &amp; top-ups</span>
                <ChevronRight className="h-4 w-4 text-slate-300" />
              </NavLink>
            </nav>

            <div className="mt-4 border-t border-slate-100 px-3 pt-3">
              <button
                type="button"
                onClick={handleLogout}
                disabled={logoutMutation.isPending}
                className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-60"
              >
                {logoutMutation.isPending ? <Spinner size="sm" decorative /> : <LogOut className="h-5 w-5" />}
                {logoutMutation.isPending ? "Signing out..." : "Sign out"}
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

// Mobile top bar: menu icon (opens the side menu), logo, and the avatar
// (also opens the side menu).
export function PortalTopBar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user } = useAuthStore();
  const initial = user?.full_name?.trim()?.[0]?.toUpperCase() ?? "?";
  const close = () => setMenuOpen(false);

  return (
    <>
      <header
        className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-slate-100 bg-white/85 px-3 backdrop-blur-xl"
        style={{ paddingTop: "var(--safe-area-inset-top)" }}
      >
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--brand-navy)] transition-colors hover:bg-slate-100 active:scale-95"
        >
          <Menu className="h-6 w-6" />
        </button>

        <Link to="/portal" aria-label="LavernaEvents dashboard">
          <Logo size="sm" />
        </Link>

        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Account menu"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[image:var(--gradient-brand)] text-sm font-semibold text-white shadow-sm ring-2 ring-white transition-transform active:scale-95"
        >
          {initial}
        </button>
      </header>

      <MobileDrawer open={menuOpen} onClose={close} />
    </>
  );
}

// Mobile: floating dock with every main feature - Home, Events, Guests,
// Templates, Gallery, Billing. The active item gets a sliding pill. The
// dock steps aside while the keyboard is open so it never covers a field.
export function PortalBottomNav() {
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    const isField = (el: Element | null) =>
      !!el &&
      (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || (el as HTMLElement).isContentEditable);
    const onIn = (e: FocusEvent) => {
      if (isField(e.target as Element)) setTyping(true);
    };
    const onOut = () => setTyping(false);
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
    };
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <nav
        aria-label="Portal"
        className={cn(
          "dock-glass fixed inset-x-3 bottom-[calc(0.75rem+var(--safe-area-inset-bottom))] z-40 mx-auto max-w-md rounded-[1.75rem] p-1.5 transition-[transform,opacity] duration-300",
          typing && "pointer-events-none translate-y-[140%] opacity-0"
        )}
      >
        <LayoutGroup id="portal-dock">
          <ul className="grid grid-cols-6 gap-0.5">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className="relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl px-0.5 py-1.5 text-[9.5px] font-semibold tracking-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-pink)]/50 active:scale-95"
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span
                          layoutId="dock-active"
                          className="absolute inset-0 rounded-2xl bg-[image:var(--gradient-brand)] shadow-md"
                          transition={{ type: "spring", damping: 26, stiffness: 340 }}
                        />
                      )}
                      <item.icon
                        className={cn("relative h-5 w-5 transition-colors", isActive ? "text-white" : "text-slate-400")}
                        aria-hidden="true"
                      />
                      <span className={cn("relative transition-colors", isActive ? "text-white" : "text-slate-500")}>
                        {item.shortLabel}
                      </span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </LayoutGroup>
      </nav>
    </MotionConfig>
  );
}