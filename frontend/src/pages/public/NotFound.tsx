import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Home } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { usePageMeta } from "@/hooks/usePageMeta";
import { cn } from "@/lib/utils";
import Logo from "@/components/brand/Logo";
import Aurora from "@/components/public/Aurora";

export default function NotFound() {
  usePageMeta("Page not found", "The page you are looking for does not exist or has moved.");
  const reduceMotion = useReducedMotion();

  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-12 text-center text-white"
      style={{ background: "var(--gradient-brand)" }}
    >
      <Aurora />

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex flex-col items-center"
      >
        <Link to="/" aria-label="LavernaEvents home">
          <Logo size="lg" tone="light" />
        </Link>

        <p className="text-gradient-brand mt-12 text-8xl font-semibold leading-none tracking-tight sm:text-9xl">404</p>
        <h1 className="mt-4 text-2xl font-semibold sm:text-3xl">This page took a different turn</h1>
        <p className="mt-3 max-w-sm text-white/75">
          The page you are looking for does not exist or has moved. Let's get you back to the celebration.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            to="/"
            className={cn(
              buttonVariants({ size: "lg" }),
              "group bg-white text-[var(--brand-pink)] hover:bg-white/90"
            )}
          >
            <Home className="h-4 w-4" />
            Back to home
          </Link>
          <Link
            to="/features"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "group border-white/40 bg-transparent text-white hover:bg-white/10"
            )}
          >
            Explore features
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </motion.div>
    </div>
  );
}