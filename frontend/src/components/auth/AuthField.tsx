import type { ReactNode } from "react";
import { Check, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Puts a small icon inside the left edge of an Input or PasswordInput and
// tints it pink while the field has focus. Give the field itself the class
// "pl-11" so the text clears the icon.
export function IconField({ icon: Icon, children, className }: { icon: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <div className={cn("group relative", className)}>
      {children}
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-[var(--brand-pink)]">
        <Icon className="h-[18px] w-[18px]" />
      </span>
    </div>
  );
}

// The note shown above a form after verifying a phone or resetting a password.
export function AuthNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700" role="status">
      {children}
    </div>
  );
}

// A strength bar for new passwords. Judged on the device only; the real
// rules are still enforced by the form schema and the server.
export function PasswordStrength({ value }: { value: string }) {
  if (!value) return null;

  let score = 0;
  if (value.length >= 8) score++;
  if (value.length >= 12) score++;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score++;
  if (/^\d+$/.test(value)) score = Math.min(score, 1);

  const levels = [
    { label: "Too weak", bar: "bg-rose-500", text: "text-rose-600" },
    { label: "Weak", bar: "bg-rose-500", text: "text-rose-600" },
    { label: "Okay", bar: "bg-amber-400", text: "text-amber-600" },
    { label: "Good", bar: "bg-lime-500", text: "text-lime-600" },
    { label: "Strong", bar: "bg-emerald-500", text: "text-emerald-600" },
  ];
  const level = levels[score];

  return (
    <div className="flex items-center gap-3" aria-live="polite">
      <div className="flex flex-1 gap-1.5" aria-hidden="true">
        {[1, 2, 3, 4].map((step) => (
          <span key={step} className={cn("h-1.5 flex-1 rounded-full transition-colors duration-300", score >= step ? level.bar : "bg-slate-100")} />
        ))}
      </div>
      <span className={cn("w-16 text-right text-xs font-semibold", level.text)}>{level.label}</span>
    </div>
  );
}

// "Didn't get a code?" with the countdown, as a soft panel under the form.
export function ResendCode({
  cooldown,
  pending,
  onResend,
  notice,
  error,
}: {
  cooldown: number;
  pending: boolean;
  onResend: () => void;
  notice?: string;
  error?: string;
}) {
  const waiting = cooldown > 0;

  return (
    <div className="mt-6 rounded-2xl bg-slate-50 px-4 py-3.5 text-center">
      <p className="flex flex-wrap items-center justify-center gap-x-1.5 text-sm text-slate-500">
        Didn&apos;t get a code?
        <button
          type="button"
          onClick={onResend}
          disabled={waiting || pending}
          className="font-semibold text-[var(--brand-pink)] transition-colors hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
        >
          {waiting ? `Resend in ${cooldown}s` : pending ? "Sending..." : "Resend code"}
        </button>
      </p>
      {waiting && (
        <div className="mx-auto mt-2.5 h-1 w-40 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
          <div className="h-full rounded-full bg-[var(--brand-pink)] transition-[width] duration-1000 ease-linear" style={{ width: `${Math.min(100, (cooldown / 60) * 100)}%` }} />
        </div>
      )}
      {notice && !error && (
        <p className="mt-2 flex items-center justify-center gap-1 text-xs font-medium text-emerald-600">
          <Check className="h-3 w-3" strokeWidth={3} />
          {notice}
        </p>
      )}
      {error && <p className="mt-2 text-xs font-medium text-rose-600" role="alert">{error}</p>}
    </div>
  );
}