import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Image as ImageIcon,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Mail,
  PackagePlus,
  Radio,
  ShieldCheck,
  Star,
  Users,
  Wallet,
  X,
} from "lucide-react";
import Logo from "@/components/brand/Logo";
import { useAuthStore } from "@/stores/auth.store";
import { useLogoutMutation } from "@/queries/useAuthQueries";
import { useAdminReviewCounts } from "@/queries/useReviewQueries";
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

// Mirrors components/portal/PortalNav.tsx's structure exactly - a single
// source of truth array feeding both the desktop sidebar and the mobile
// bottom bar / "More" sheet, so a new admin destination is added once here.
//
// Phase 26: added "Channel Pools" (platform-wide pool monitoring + topup)
// and "Topup Packs" (admin CRUD on the fixed packs organizers can buy).
const NAV_ITEMS = [
  { to: "/admin", label: "Dashboard", shortLabel: "Home", icon: LayoutDashboard, end: true },
  { to: "/admin/users", label: "Users", shortLabel: "Users", icon: Users, end: false },
  { to: "/admin/plans", label: "Plans", shortLabel: "Plans", icon: Wallet, end: false },
  { to: "/admin/templates", label: "Templates", shortLabel: "Templates", icon: Mail, end: false },
  { to: "/admin/media", label: "Media", shortLabel: "Media", icon: ImageIcon, end: false },
  { to: "/admin/channel-pools", label: "Channel Pools", shortLabel: "Pools", icon: Radio, end: false },
  { to: "/admin/topup-packs", label: "Topup Packs", shortLabel: "Topups", icon: PackagePlus, end: false },
  { to: "/admin/reviews", label: "Reviews", shortLabel: "Reviews", icon: Star, end: false },
  { to: "/admin/reports", label: "Reports", shortLabel: "Reports", icon: ShieldCheck, end: false },
];

// Number of reviews nobody has read yet; shown next to "Reviews".
function useUnreadReviews(): number {
  const { data } = useAdminReviewCounts();
  return data?.unread ?? 0;
}

function UnreadBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--brand-pink)] px-1.5 text-[10px] font-bold text-white",
        className
      )}
      aria-label={`${count} unread`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

const PRIMARY_MOBILE_TABS = ["/admin", "/admin/users"];

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-pink)]/40",
    isActive
      ? "bg-gradient-to-r from-[var(--brand-pink)]/12 to-[var(--brand-pink)]/[0.03] font-semibold text-[var(--brand-pink)] before:absolute before:left-0 before:top-1/2 before:h-6 before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-[var(--brand-pink)]"
      : "text-slate-600 hover:bg-slate-100 hover:text-[var(--brand-navy)] [@media(hover:hover)]:hover:translate-x-0.5"
  );

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
      <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[image:var(--gradient-brand)] text-sm font-semibold text-white shadow-sm">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--brand-navy)]">
            {user?.full_name ?? "Admin"}
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
        <LogOut className="h-4 w-4" />
        {logoutMutation.isPending ? "Signing out..." : "Sign out"}
      </button>
    </>
  );
}

export function AdminSidebar() {
  const unread = useUnreadReviews();

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-slate-100 bg-white shadow-[1px_0_0_0_rgba(36,21,66,0.02)]">
      <div className="flex h-16 items-center border-b border-slate-100 px-6">
        <Link to="/admin" aria-label="LavernaEvents admin dashboard">
          <Logo size="sm" />
        </Link>
        <span className="ml-2 rounded-full bg-[var(--brand-navy)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
          Admin
        </span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Admin">
        <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Menu</p>
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
            <item.icon className="h-4 w-4" />
            <span className="flex-1">{item.label}</span>
            {item.to === "/admin/reviews" && <UnreadBadge count={unread} />}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-100 p-3">
        <AccountBlock />
      </div>
    </aside>
  );
}

export function AdminTopBar() {
  const [menuOpen, setMenuOpen] = useState(false);
  useEscapeToClose(menuOpen, () => setMenuOpen(false));
  const { user } = useAuthStore();
  const initial = user?.full_name?.trim()?.[0]?.toUpperCase() ?? "?";

  return (
    <header
      className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-slate-100 bg-white/85 px-4 backdrop-blur-xl"
      style={{ paddingTop: "var(--safe-area-inset-top)" }}
    >
      <Link
        to="/admin"
        onClick={() => setMenuOpen(false)}
        className="flex items-center gap-2"
        aria-label="LavernaEvents admin dashboard"
      >
        <Logo size="sm" />
        <span className="rounded-full bg-[var(--brand-navy)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
          Admin
        </span>
      </Link>

      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[image:var(--gradient-brand)] text-sm font-semibold text-white shadow-sm ring-2 ring-white transition-transform active:scale-95"
          aria-label="Account menu"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          {initial}
        </button>

        <AnimatePresence>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-11 z-50 w-60 overflow-hidden rounded-2xl border border-slate-100 bg-white p-1.5 soft-shadow-lg"
              >
                <AccountBlock onNavigate={() => setMenuOpen(false)} />
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}

// Mobile: fixed bottom tab bar - Dashboard + Users always visible, "More"
// opens a sheet with the rest.
//
// Phase 26: the "More" sheet holds the secondary items in a 3-column grid
// and scrolls if the screen is short.
export function AdminBottomNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  useEscapeToClose(moreOpen, () => setMoreOpen(false));
  const { pathname } = useLocation();
  const unread = useUnreadReviews();

  const secondaryItems = NAV_ITEMS.filter((item) => !PRIMARY_MOBILE_TABS.includes(item.to));

  // Highlight "More" while the user is on a page that only lives inside it.
  const onSecondaryPage = secondaryItems.some((item) => pathname.startsWith(item.to));

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around gap-1 border-t border-slate-100 bg-white/90 px-3 pt-2 shadow-[0_-8px_24px_-12px_rgba(36,21,66,0.12)] backdrop-blur-xl"
        style={{ paddingBottom: "calc(0.5rem + var(--safe-area-inset-bottom))" }}
      >
        {NAV_ITEMS.filter((item) => PRIMARY_MOBILE_TABS.includes(item.to)).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-1.5 text-[11px] font-semibold transition-all duration-200 active:scale-95",
                isActive
                  ? "bg-[var(--brand-pink)]/10 text-[var(--brand-pink)]"
                  : "text-slate-400 hover:text-slate-600"
              )
            }
          >
            <item.icon className="h-5 w-5" />
            {item.shortLabel}
          </NavLink>
        ))}

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={cn(
            "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-1.5 text-[11px] font-semibold transition-all duration-200 active:scale-95",
            onSecondaryPage
              ? "bg-[var(--brand-pink)]/10 text-[var(--brand-pink)]"
              : "text-slate-400 hover:text-slate-600"
          )}
        >
          <span className="relative">
            <LayoutGrid className="h-5 w-5" />
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-[var(--brand-pink)]" />
            )}
          </span>
          More
        </button>
      </nav>

      <AnimatePresence>
        {moreOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 bg-[var(--brand-navy)]/40 backdrop-blur-sm"
              onClick={() => setMoreOpen(false)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              role="dialog"
              aria-modal="true"
              aria-label="More"
              className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-[2rem] bg-white p-4 shadow-[0_-20px_50px_-20px_rgba(36,21,66,0.35)]"
              style={{ paddingBottom: "calc(1.25rem + var(--safe-area-inset-bottom))" }}
            >
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200" />

              <div className="flex items-center justify-between px-1">
                <p className="text-sm font-semibold text-[var(--brand-navy)]">More</p>
                <button
                  type="button"
                  onClick={() => setMoreOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2.5">
                {secondaryItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setMoreOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "flex flex-col items-center gap-2 rounded-2xl border p-3.5 text-xs font-semibold transition-all active:scale-95",
                        isActive
                          ? "border-[var(--brand-pink)]/25 bg-[var(--brand-pink)]/8 text-[var(--brand-pink)] shadow-sm"
                          : "border-slate-100 bg-slate-50/60 text-slate-600 hover:bg-slate-100"
                      )
                    }
                  >
                    <span className="relative">
                      <item.icon className="h-5 w-5" />
                      {item.to === "/admin/reviews" && unread > 0 && (
                        <UnreadBadge count={unread} className="absolute -right-3 -top-2 h-4 min-w-4 px-1 text-[9px]" />
                      )}
                    </span>
                    {item.shortLabel}
                  </NavLink>
                ))}
              </div>

              <div className="mt-4 border-t border-slate-100 pt-3">
                <AccountBlock onNavigate={() => setMoreOpen(false)} />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}