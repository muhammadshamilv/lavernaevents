import Logo from "@/components/brand/Logo";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

// Full-screen loader: the logo with a spinner under it. Used while the app
// opens or a portal checks who is signed in. With `overlay` it sits on top
// of the page instead of replacing it.

interface FullScreenLoaderProps {
  message?: string;
  overlay?: boolean;
  className?: string;
}

export function FullScreenLoader({ message = "Loading", overlay = false, className }: FullScreenLoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex min-h-dvh flex-col items-center justify-center gap-6 bg-white px-6 text-center",
        overlay && "fixed inset-0 z-[90] min-h-0 bg-white/85 backdrop-blur-sm",
        className
      )}
    >
      <Logo size="md" />
      <div className="flex flex-col items-center gap-3 text-[var(--brand-pink)]">
        <Spinner size="lg" decorative />
        <p className="text-sm font-medium text-slate-500">{message}</p>
      </div>
    </div>
  );
}

// Shown inside the portal layout while a page is being fetched, so the
// navigation stays on screen instead of vanishing.
export function PageLoader({ message = "Loading" }: { message?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-[50dvh] flex-col items-center justify-center gap-3 text-[var(--brand-pink)]">
      <Spinner size="lg" decorative />
      <p className="text-sm font-medium text-slate-500">{message}</p>
    </div>
  );
}