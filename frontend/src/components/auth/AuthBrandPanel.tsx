import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { CalendarDays, Camera, MapPin, QrCode, Send, ShieldCheck, Sparkles, type LucideIcon } from "lucide-react";
import Logo from "@/components/brand/Logo";
import Aurora from "@/components/public/Aurora";
import { cn } from "@/lib/utils";

export type AuthVariant = "login" | "register" | "verify" | "forgot" | "reset";

interface PanelCopy {
  badge: string;
  title: string;
  text: string;
  points: { icon: LucideIcon; label: string }[];
}

const EVENT_POINTS = [
  { icon: Send, label: "Invitations by WhatsApp, SMS and email" },
  { icon: QrCode, label: "Live RSVPs and QR passes for every guest" },
  { icon: Camera, label: "Guests find their photos with one selfie" },
];

const SECURITY_POINTS = [
  { icon: ShieldCheck, label: "Codes expire quickly and work once" },
  { icon: Send, label: "Sent to your phone and email" },
  { icon: Sparkles, label: "Back to your events in under a minute" },
];

// What the dark side panel says on each screen.
export const PANEL_COPY: Record<AuthVariant, PanelCopy> = {
  login: {
    badge: "Welcome back",
    title: "Pick up right where you left off.",
    text: "Your events, guests and invitations are all waiting in one place.",
    points: EVENT_POINTS,
  },
  register: {
    badge: "Join LavernaEvents",
    title: "Celebrate beautifully. Connect meaningfully.",
    text: "Plan events, send invitations and keep every guest in the loop, or upload photos as a photographer.",
    points: EVENT_POINTS,
  },
  verify: {
    badge: "One quick step",
    title: "Let's make sure it's really you.",
    text: "A short code keeps your account and your guests' details safe.",
    points: SECURITY_POINTS,
  },
  forgot: {
    badge: "Account recovery",
    title: "Locked out? It happens to everyone.",
    text: "Tell us how to reach you and we'll send a reset code right away.",
    points: SECURITY_POINTS,
  },
  reset: {
    badge: "Almost there",
    title: "Choose a new password and carry on.",
    text: "Pick something strong that you don't use anywhere else.",
    points: SECURITY_POINTS,
  },
};

// Three small cards that float over the panel, showing what the product does.
// All sample text is generic on purpose.
function FloatingCards() {
  const reduce = useReducedMotion();
  const enter = (delay: number) =>
    reduce
      ? {}
      : { initial: { opacity: 0, y: 24, scale: 0.96 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] as const } };

  return (
    <div className="relative mx-auto mt-10 h-[19rem] w-full max-w-sm" aria-hidden="true">
      <div className="absolute left-0 top-0 w-[15rem] animate-float-slow">
        <motion.div {...enter(0.2)} className="overflow-hidden rounded-3xl bg-white text-center soft-shadow-lg">
          <div className="flex h-16 items-center justify-center" style={{ background: "linear-gradient(135deg, #fbd5e6 0%, #fff0d1 100%)" }}>
            <span className="text-xl font-light tracking-tight text-[var(--brand-navy)]">You&apos;re invited</span>
          </div>
          <div className="px-4 pb-4 pt-3">
            <p className="text-base font-semibold text-[var(--brand-navy)]">Your event name</p>
            <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-slate-600">
              <CalendarDays className="h-3 w-3 text-[var(--brand-pink)]" />
              Saturday, 6:30 pm
            </p>
            <p className="mt-1 flex items-center justify-center gap-1.5 text-[11px] text-slate-600">
              <MapPin className="h-3 w-3 text-[var(--brand-pink)]" />
              Your venue
            </p>
            <div className="mt-3 grid grid-cols-2 gap-1.5 text-[11px] font-semibold">
              <span className="flex h-7 items-center justify-center rounded-full bg-[var(--brand-pink)] text-white">I&apos;ll be there</span>
              <span className="flex h-7 items-center justify-center rounded-full border border-slate-200 text-slate-500">Can&apos;t make it</span>
            </div>
          </div>
        </motion.div>
      </div>

      <motion.div {...enter(0.5)} className="absolute right-0 top-6 w-44 rounded-2xl bg-white p-3.5 soft-shadow-lg">
        <p className="text-[11px] font-medium text-slate-500">Replies so far</p>
        <p className="mt-0.5 text-2xl font-semibold tracking-tight text-[var(--brand-navy)]">128</p>
        <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-slate-100">
          <span className="w-[68%] bg-[var(--brand-green)]" />
          <span className="w-[20%] bg-[var(--brand-gold)]" />
        </div>
        <p className="mt-1.5 text-[10px] text-slate-500">Most are coming</p>
      </motion.div>

      <motion.div {...enter(0.8)} className="absolute bottom-0 right-4 flex w-52 items-center gap-3 rounded-2xl bg-white p-3 soft-shadow-lg">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-pink)]/10 text-[var(--brand-pink)]">
          <Camera className="h-5 w-5" />
        </span>
        <span className="text-xs leading-snug text-slate-500">
          <span className="block text-sm font-semibold text-[var(--brand-navy)]">24 photos found</span>
          matched by selfie
        </span>
      </motion.div>
    </div>
  );
}

// The coloured side of the split-screen sign-in. Only shown on large screens;
// phones get the slimmer AuthMobileHeader below.
export function AuthBrandPanel({ variant, className }: { variant: AuthVariant; className?: string }) {
  const copy = PANEL_COPY[variant];
  const reduce = useReducedMotion();

  return (
    <aside
      className={cn("relative flex-col justify-between overflow-hidden p-10 text-white xl:p-14", className)}
      style={{ background: "var(--gradient-brand)" }}
    >
      <Aurora />

      <Link to="/" aria-label="LavernaEvents home" className="relative z-10 inline-flex w-fit">
        <Logo size="md" tone="light" />
      </Link>

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 my-10"
      >
        <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium backdrop-blur">
          <Sparkles className="h-4 w-4" />
          {copy.badge}
        </span>
        <h1 className="mt-6 max-w-md text-balance text-3xl font-semibold leading-[1.15] tracking-tight xl:text-4xl">{copy.title}</h1>
        <p className="mt-4 max-w-md text-white/80">{copy.text}</p>

        <ul className="mt-7 space-y-3">
          {copy.points.map((point) => (
            <li key={point.label} className="flex items-center gap-3 text-sm text-white/90">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15">
                <point.icon className="h-4 w-4" />
              </span>
              {point.label}
            </li>
          ))}
        </ul>

        <FloatingCards />
      </motion.div>

      <p className="relative z-10 text-sm text-white/60">© {new Date().getFullYear()} LavernaEvents</p>
    </aside>
  );
}

// Compact brand band at the top of the screen on phones and tablets.
export function AuthMobileHeader({ variant, className }: { variant: AuthVariant; className?: string }) {
  const copy = PANEL_COPY[variant];

  return (
    <header
      className={cn("relative flex flex-col items-center overflow-hidden px-6 pb-14 text-center text-white", className)}
      style={{ background: "var(--gradient-brand)", paddingTop: "calc(1.75rem + var(--safe-area-inset-top))" }}
    >
      <Aurora />
      <Link to="/" aria-label="LavernaEvents home" className="relative z-10 inline-flex">
        <Logo size="md" tone="light" />
      </Link>
      <p className="relative z-10 mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur">
        <Sparkles className="h-3 w-3" />
        {copy.badge}
      </p>
    </header>
  );
}