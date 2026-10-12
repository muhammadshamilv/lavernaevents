import { Suspense, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { motion, useReducedMotion, useScroll, useSpring } from "framer-motion";
import Navbar from "@/components/public/Navbar";
import Footer from "@/components/public/Footer";
import { Skeleton } from "@/components/ui/skeleton";

// A new page opens at its top, not wherever the last one was scrolled. A link
// with a #section (e.g. /features#photos) scrolls to that section instead,
// waiting briefly for the lazily loaded page to draw it.
function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
      return;
    }

    const id = decodeURIComponent(hash.slice(1));
    let tries = 0;
    let frame = 0;

    const seek = () => {
      const target = document.getElementById(id);
      if (target) {
        target.scrollIntoView({ block: "start" });
      } else if (tries++ < 40) {
        frame = requestAnimationFrame(seek);
      }
    };

    frame = requestAnimationFrame(seek);
    return () => cancelAnimationFrame(frame);
  }, [pathname, hash]);

  return null;
}

// A thin brand-coloured line under the navbar showing how far down the page
// the visitor has read.
function ScrollProgress() {
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 30, restDelta: 0.001 });

  if (reduceMotion) return null;

  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-[60] h-[3px] origin-left bg-gradient-to-r from-[var(--brand-pink)] via-[var(--brand-gold)] to-[var(--brand-green)]"
    />
  );
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
  const { pathname } = useLocation();
  const reduceMotion = useReducedMotion();

  return (
    <div className="flex min-h-screen flex-col bg-slate-50/70">
      <a
        href="#main-content"
        className="sr-only z-[70] rounded-full bg-white px-4 py-2 text-sm font-semibold text-[var(--brand-navy)] focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <ScrollToTop />
      <ScrollProgress />
      <Navbar />
      <main id="main-content" className="flex-1">
        <Suspense fallback={<PageFallback />}>
          <motion.div
            key={pathname}
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            <Outlet />
          </motion.div>
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}