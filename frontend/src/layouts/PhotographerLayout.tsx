import { useState } from "react";
import { Link, Navigate, NavLink, Outlet } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, LogOut, Settings } from "lucide-react";
import logo from "@/assets/laverna-logo.png";
import { useAuthStore } from "@/stores/auth.store";
import { useLogoutMutation } from "@/queries/useAuthQueries";
import { Toaster } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { homePathForRole } from "@/lib/roleHome";

const NAV_ITEMS = [
  { to: "/photographer", label: "Events", shortLabel: "Events", icon: CalendarDays, end: true },
  { to: "/photographer/settings", label: "Account settings", shortLabel: "Settings", icon: Settings, end: false },
];

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
    isActive
      ? "bg-[var(--brand-pink)]/8 text-[var(--brand-pink)] before:absolute before:left-0 before:top-1/2 before:h-5 before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-[var(--brand-pink)]"
      : "text-slate-600 hover:bg-slate-100 hover:text-[var(--brand-navy)]"
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
      <div className="flex items-center gap-3 rounded-xl px-3 py-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-navy)] text-sm font-semibold text-white">
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
        <LogOut className="h-4 w-4" />
        {logoutMutation.isPending ? "Signing out..." : "Sign out"}
      </button>
    </>
  );
}

function PhotographerSidebar() {
  return (
    <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-slate-100 bg-white lg:flex">
      <div className="flex h-16 items-center border-b border-slate-100 px-6">
        <Link to="/photographer">
          <img src={logo} alt="LavernaEvents" className="h-8 w-auto object-contain" />
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
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

function PhotographerTopBar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user } = useAuthStore();
  const initial = user?.full_name?.trim()?.[0]?.toUpperCase() ?? "?";

  return (
    <header
      className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-slate-100 bg-white/90 px-4 backdrop-blur-md lg:hidden"
      style={{ paddingTop: "var(--safe-area-inset-top)" }}
    >
      <Link to="/photographer" onClick={() => setMenuOpen(false)}>
        <img src={logo} alt="LavernaEvents" className="h-7 w-auto object-contain" />
      </Link>

      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand-navy)] text-sm font-semibold text-white"
          aria-label="Account menu"
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
                className="absolute right-0 top-11 z-50 w-44 overflow-hidden rounded-2xl border border-slate-100 bg-white soft-shadow-lg p-1.5"
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

function PhotographerBottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-slate-100 bg-white/95 px-2 pt-2 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: "calc(0.5rem + var(--safe-area-inset-bottom))" }}
    >
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cn(
              "flex flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-1.5 text-xs font-medium transition-all duration-200",
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

    </nav>
  );
}

export default function PhotographerLayout() {
  const { user } = useAuthStore();

  if (user && user.role !== "PHOTOGRAPHER") {
    return <Navigate to={homePathForRole(user.role)} replace />;
  }

  return (
    <div className="flex min-h-screen bg-slate-50/70">
      <PhotographerSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <PhotographerTopBar />

        <main className="mobile-safe-bottom flex-1 pb-20 lg:pb-0">
          <Outlet />
        </main>

        <PhotographerBottomNav />
      </div>

      <Toaster />
    </div>
  );
}