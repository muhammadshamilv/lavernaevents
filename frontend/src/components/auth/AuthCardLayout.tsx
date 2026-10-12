import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { AuthBrandPanel, AuthMobileHeader, type AuthVariant } from "@/components/auth/AuthBrandPanel";
import { cn } from "@/lib/utils";

interface AuthCardLayoutProps {
  /** Decides what the brand panel says. Defaults to the recovery wording. */
  variant?: AuthVariant;
  /** With an icon the heading is centred (code screens); without, it is left-aligned (sign in / register). */
  icon?: ReactNode;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Put the brand panel on the right instead of the left (large screens). */
  flip?: boolean;
  /** A wider form column, for the longer register screen. */
  wide?: boolean;
}

/**
 * The one frame every sign-in screen shares.
 *
 *  - Large screens: a split view, brand panel on one side, the form on the other.
 *  - Phones and tablets: a brand band on top and the form on a rounded sheet
 *    that overlaps it.
 *
 * It is a single tree, laid out with CSS only, so nothing is mounted twice and
 * nothing flickers when the window is resized.
 */
export default function AuthCardLayout({
  variant = "forgot",
  icon,
  title,
  subtitle,
  children,
  footer,
  flip = false,
  wide = false,
}: AuthCardLayoutProps) {
  const reduce = useReducedMotion();
  const centred = Boolean(icon);

  return (
    <div className="flex min-h-dvh flex-col lg:grid lg:grid-cols-2">
      <AuthMobileHeader variant={variant} className="lg:hidden" />
      <AuthBrandPanel variant={variant} className={cn("hidden lg:flex", flip && "lg:order-2")} />

      <main className="gradient-mesh-subtle relative flex flex-1 items-stretch justify-center sm:items-start sm:px-6 lg:items-center lg:px-10 lg:py-12">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            "relative -mt-8 w-full rounded-t-[2rem] bg-white px-5 pt-8 pb-[calc(2.5rem+var(--safe-area-inset-bottom))] shadow-[0_-14px_40px_-16px_rgba(36,21,66,0.3)]",
            "sm:mb-10 sm:rounded-[2rem] sm:border sm:border-slate-100 sm:p-8 sm:pb-8 sm:shadow-[0_24px_60px_-24px_rgba(36,21,66,0.25)]",
            "lg:mb-0 lg:mt-0 lg:max-w-none lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none",
            wide ? "sm:max-w-xl lg:w-full lg:max-w-[34rem]" : "sm:max-w-md lg:w-full lg:max-w-[27rem]"
          )}
        >
          <div className={cn(centred && "text-center")}>
            {icon && (
              <motion.div
                initial={reduce ? false : { scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", damping: 14, stiffness: 220, delay: 0.1 }}
                className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-lg shadow-[var(--brand-pink)]/30"
                style={{ background: "linear-gradient(135deg, var(--brand-pink-light), var(--brand-pink-dark))" }}
              >
                {icon}
              </motion.div>
            )}
            <h2 className={cn("text-2xl font-semibold tracking-tight text-[var(--brand-navy)] sm:text-[1.7rem]", icon && "mt-5")}>
              {title}
            </h2>
            {subtitle && <p className="mt-2 break-words text-sm leading-relaxed text-slate-500">{subtitle}</p>}
          </div>

          <div className="mt-7">{children}</div>

          {footer && <div className="mt-7 text-center text-sm text-slate-500">{footer}</div>}

          <p className="mt-8 text-center text-xs text-slate-400">
            <Link to="/terms" className="hover:text-[var(--brand-pink)]">Terms</Link>
            <span className="mx-2" aria-hidden="true">·</span>
            <Link to="/privacy" className="hover:text-[var(--brand-pink)]">Privacy</Link>
          </p>
        </motion.div>
      </main>
    </div>
  );
}