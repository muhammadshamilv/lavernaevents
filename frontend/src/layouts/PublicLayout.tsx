import { Suspense, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Navbar from "@/components/public/Navbar";
import Footer from "@/components/public/Footer";
import { Skeleton } from "@/components/ui/skeleton";

// A new page should open at its top, not wherever the last one was scrolled.
function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);

  return null;
}

function PageFallback() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-16 sm:px-6 lg:px-8">
      <Skeleton className="h-10 w-2/3 max-w-md" />
      <Skeleton className="h-4 w-full max-w-xl" />
      <Skeleton className="h-64 w-full rounded-3xl" />
    </div>
  );
}

export default function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50/70">
      <a
        href="#main-content"
        className="sr-only z-[70] rounded-full bg-white px-4 py-2 text-sm font-semibold text-[var(--brand-navy)] focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <ScrollToTop />
      <Navbar />
      <main id="main-content" className="flex-1">
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}