import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import logo from "@/assets/laverna-logo.png";
import { Card } from "@/components/ui/card";

interface AuthCardLayoutProps {
  icon: ReactNode;
  title: string;
  subtitle: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * One centred, single-column layout shared by the verify / forgot / reset
 * screens. A single tree at every width: padding and the card scale with
 * the viewport, nothing is mounted twice.
 */
export default function AuthCardLayout({
  icon,
  title,
  subtitle,
  children,
  footer,
}: AuthCardLayoutProps) {
  return (
    <div className="gradient-mesh-subtle mobile-safe-bottom flex min-h-screen flex-col justify-center px-4 py-8 sm:px-6 lg:p-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mx-auto w-full max-w-md"
      >
        <div className="flex justify-center">
          <Link to="/">
            <img src={logo} alt="LavernaEvents" className="h-10 w-auto object-contain" />
          </Link>
        </div>

        <Card className="mt-6 p-5 text-center sm:mt-8 sm:p-8 lg:p-10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--brand-pink)]/10 text-[var(--brand-pink)]">
            {icon}
          </div>

          <h1 className="mt-5 text-xl font-bold text-[var(--brand-navy)] sm:text-2xl">
            {title}
          </h1>
          <p className="mt-2 break-words text-sm text-slate-500">{subtitle}</p>

          <div className="mt-6 text-left sm:mt-8">{children}</div>
        </Card>

        {footer && (
          <div className="mt-6 text-center text-sm text-slate-500">{footer}</div>
        )}
      </motion.div>
    </div>
  );
}