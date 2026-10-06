import { useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useParams } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  CalendarCheck,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Heart,
  HelpCircle,
  MapPin,
  Navigation,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useInvitationByToken, useSubmitGuestResponse } from "@/queries/useResponseQueries";
import { formatEventTime } from "@/lib/eventDisplay";
import { FONT_FAMILY, useInvitationFonts } from "@/lib/invitationFonts";
import { resolveMediaUrl } from "@/lib/media";
import { getApiErrorMessage } from "@/lib/apiError";
import { cn } from "@/lib/utils";
import type { GuestResponseStatus } from "@/types/response.types";

// ---------------------------------------------------------------------
// Event-type themes - colours, heading font and background animation
// ---------------------------------------------------------------------

type ThemeKey = "romantic" | "party" | "corporate" | "sacred" | "festive";

interface Theme {
  key: ThemeKey;
  background: string;
  accent: string;
  accentDark: string;
  onDark: boolean;
  headingFont: string;
  kicker: string;
  palette: string[];
}

const THEMES: Record<ThemeKey, Theme> = {
  romantic: {
    key: "romantic",
    background: "linear-gradient(160deg, #fff1f3 0%, #fde4ec 45%, #fff6e5 100%)",
    accent: "#C2185B",
    accentDark: "#9C1349",
    onDark: false,
    headingFont: FONT_FAMILY.script,
    kicker: "Together with their families",
    palette: ["#f8a5c2", "#f78fb3", "#ffd1dc", "#f5cd79", "#e8b4c8"],
  },
  party: {
    key: "party",
    background: "linear-gradient(160deg, #fff7e6 0%, #ffe8f1 50%, #e8f0ff 100%)",
    accent: "#E11D74",
    accentDark: "#B8135C",
    onDark: false,
    headingFont: FONT_FAMILY.playful,
    kicker: "Let's celebrate together",
    palette: ["#ff6b6b", "#feca57", "#48dbfb", "#ff9ff3", "#1dd1a1", "#8e6bff"],
  },
  corporate: {
    key: "corporate",
    background: "linear-gradient(160deg, #0b1b3a 0%, #13284f 55%, #1b3a6b 100%)",
    accent: "#E0A800",
    accentDark: "#B88A00",
    onDark: true,
    headingFont: FONT_FAMILY.serif,
    kicker: "You are cordially invited",
    palette: ["#4f8cff", "#7aa9ff", "#f5b700", "#9db8ff"],
  },
  sacred: {
    key: "sacred",
    background: "linear-gradient(160deg, #fff8e7 0%, #ffeccb 50%, #fff3df 100%)",
    accent: "#B7791F",
    accentDark: "#8F5E16",
    onDark: false,
    headingFont: FONT_FAMILY.serif,
    kicker: "With divine blessings",
    palette: ["#f6c453", "#ffd98a", "#fff3c4", "#e9a23b"],
  },
  festive: {
    key: "festive",
    background: "linear-gradient(160deg, #f3f0ff 0%, #fdeef8 55%, #fff6e8 100%)",
    accent: "#7C3AED",
    accentDark: "#5B21B6",
    onDark: false,
    headingFont: FONT_FAMILY.serif,
    kicker: "You're invited",
    palette: ["#a78bfa", "#f472b6", "#fbbf24", "#34d399"],
  },
};

const THEME_BY_EVENT_TYPE: Record<string, ThemeKey> = {
  WEDDING: "romantic",
  RECEPTION: "romantic",
  ENGAGEMENT: "romantic",
  ANNIVERSARY: "romantic",
  BIRTHDAY: "party",
  CORPORATE: "corporate",
  CONFERENCE: "corporate",
  SEMINAR: "corporate",
  RELIGIOUS: "sacred",
  HOUSEWARMING: "sacred",
};

function themeFor(eventType: string): Theme {
  return THEMES[THEME_BY_EVENT_TYPE[eventType] ?? "festive"];
}

// ---------------------------------------------------------------------
// Background animation (framer-motion only, no extra libraries)
// ---------------------------------------------------------------------

/** Stable pseudo-random number in [0, 1) so particles don't jump on re-render. */
function seeded(index: number, salt: number): number {
  const x = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

type ParticleShape = "petal" | "heart" | "confetti" | "balloon" | "orb" | "spark";

interface ParticleConfig {
  shape: ParticleShape;
  count: number;
  direction: "down" | "up" | "twinkle";
  speed: number; // average seconds for one pass
}

const PARTICLES_BY_THEME: Record<ThemeKey, ParticleConfig[]> = {
  romantic: [
    { shape: "petal", count: 16, direction: "down", speed: 14 },
    { shape: "heart", count: 7, direction: "up", speed: 18 },
  ],
  party: [
    { shape: "confetti", count: 28, direction: "down", speed: 9 },
    { shape: "balloon", count: 7, direction: "up", speed: 16 },
  ],
  corporate: [
    { shape: "orb", count: 9, direction: "up", speed: 22 },
    { shape: "spark", count: 10, direction: "twinkle", speed: 5 },
  ],
  sacred: [
    { shape: "spark", count: 22, direction: "twinkle", speed: 4.5 },
    { shape: "orb", count: 6, direction: "up", speed: 26 },
  ],
  festive: [
    { shape: "spark", count: 16, direction: "twinkle", speed: 4 },
    { shape: "confetti", count: 14, direction: "down", speed: 12 },
  ],
};

function ParticleShapeView({ shape, size, color }: { shape: ParticleShape; size: number; color: string }) {
  switch (shape) {
    case "petal":
      return (
        <span
          className="block"
          style={{
            width: size,
            height: size * 1.3,
            background: color,
            borderRadius: "100% 0 100% 0",
            opacity: 0.7,
          }}
        />
      );
    case "heart":
      return <Heart style={{ width: size * 1.3, height: size * 1.3, color, fill: color, opacity: 0.5 }} />;
    case "confetti":
      return (
        <span
          className="block"
          style={{ width: size * 0.55, height: size * 1.1, background: color, borderRadius: 2, opacity: 0.85 }}
        />
      );
    case "balloon":
      return (
        <span className="flex flex-col items-center" style={{ opacity: 0.75 }}>
          <span
            className="block"
            style={{
              width: size * 1.8,
              height: size * 2.2,
              background: `radial-gradient(circle at 35% 30%, #ffffffaa 0%, ${color} 45%)`,
              borderRadius: "50% 50% 50% 50% / 58% 58% 42% 42%",
            }}
          />
          <span className="block" style={{ width: 1.5, height: size * 1.6, background: `${color}aa` }} />
        </span>
      );
    case "orb":
      return (
        <span
          className="block"
          style={{
            width: size * 2.6,
            height: size * 2.6,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${color}66 0%, ${color}00 70%)`,
          }}
        />
      );
    case "spark":
    default:
      return <Sparkles style={{ width: size * 1.2, height: size * 1.2, color }} />;
  }
}

function ThemeParticles({ theme }: { theme: Theme }) {
  const reduceMotion = useReducedMotion();

  const items = useMemo(
    () =>
      PARTICLES_BY_THEME[theme.key].flatMap((config, configIndex) =>
        Array.from({ length: config.count }, (_, index) => {
          const seed = index + configIndex * 100;

          return {
            id: `${config.shape}-${seed}`,
            config,
            left: seeded(seed, 1) * 100,
            top: seeded(seed, 7) * 100,
            size: 8 + seeded(seed, 2) * 12,
            delay: seeded(seed, 3) * config.speed,
            duration: config.speed * (0.75 + seeded(seed, 4) * 0.7),
            drift: (seeded(seed, 5) - 0.5) * 120,
            rotate: seeded(seed, 6) * 360,
            color: theme.palette[Math.floor(seeded(seed, 8) * theme.palette.length)],
          };
        })
      ),
    [theme]
  );

  if (reduceMotion) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      {/* soft moving glow behind everything */}
      <motion.div
        className="absolute left-1/2 top-[18%] h-[60vh] w-[60vh] -translate-x-1/2 rounded-full"
        style={{ background: `radial-gradient(circle, ${theme.accent}22 0%, transparent 65%)` }}
        animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />

      {items.map((item) => {
        const base: CSSProperties = { position: "absolute", left: `${item.left}%` };

        if (item.config.direction === "twinkle") {
          return (
            <motion.span
              key={item.id}
              style={{ ...base, top: `${item.top}%` }}
              animate={{ opacity: [0, 1, 0], scale: [0.5, 1.15, 0.5], rotate: [0, 45, 90] }}
              transition={{
                duration: item.duration,
                delay: item.delay,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <ParticleShapeView shape={item.config.shape} size={item.size} color={item.color} />
            </motion.span>
          );
        }

        const goingDown = item.config.direction === "down";

        return (
          <motion.span
            key={item.id}
            style={{ ...base, top: 0 }}
            initial={{ y: goingDown ? "-12vh" : "108vh" }}
            animate={{
              y: goingDown ? "108vh" : "-25vh",
              x: [0, item.drift, 0],
              rotate: goingDown ? [item.rotate, item.rotate + 360] : [0, 8, -8, 0],
            }}
            transition={{
              duration: item.duration,
              delay: item.delay,
              repeat: Infinity,
              ease: "linear",
              x: { duration: item.duration, repeat: Infinity, ease: "easeInOut", delay: item.delay },
              rotate: { duration: item.duration, repeat: Infinity, ease: "linear", delay: item.delay },
            }}
          >
            <ParticleShapeView shape={item.config.shape} size={item.size} color={item.color} />
          </motion.span>
        );
      })}
    </div>
  );
}

/** A one-time burst of confetti shown when a guest accepts. */
function CelebrationBurst({ palette }: { palette: string[] }) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) return null;

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
      {Array.from({ length: 26 }, (_, index) => {
        const angle = (index / 26) * Math.PI * 2;
        const distance = 90 + seeded(index, 3) * 90;

        return (
          <motion.span
            key={index}
            className="absolute block"
            style={{
              width: 7,
              height: 12,
              borderRadius: 2,
              background: palette[index % palette.length],
            }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 0.4, rotate: 0 }}
            animate={{
              x: Math.cos(angle) * distance,
              y: Math.sin(angle) * distance + 30,
              opacity: [1, 1, 0],
              scale: 1,
              rotate: seeded(index, 9) * 540,
            }}
            transition={{ duration: 1.5, ease: "easeOut" }}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------

const STATUS_COPY: Record<
  GuestResponseStatus,
  { title: string; message: string; icon: typeof CheckCircle2; tone: string }
> = {
  ACCEPTED: {
    title: "You're coming!",
    message: "Wonderful - we can't wait to celebrate with you.",
    icon: CheckCircle2,
    tone: "#059669",
  },
  MAYBE: {
    title: "Maybe - noted",
    message: "Thank you for letting us know. We hope you can make it.",
    icon: HelpCircle,
    tone: "#D97706",
  },
  REJECTED: {
    title: "You'll be missed",
    message: "Thank you for letting us know. You will be in our thoughts.",
    icon: XCircle,
    tone: "#E11D48",
  },
  PENDING: {
    title: "Awaiting your response",
    message: "",
    icon: HelpCircle,
    tone: "#64748B",
  },
};

const RESPONSE_OPTIONS: {
  value: "ACCEPTED" | "MAYBE" | "REJECTED";
  label: string;
  hint: string;
  icon: typeof CheckCircle2;
  color: string;
}[] = [
  { value: "ACCEPTED", label: "Yes, I'll be there", hint: "Joyfully accept", icon: CheckCircle2, color: "#059669" },
  { value: "MAYBE", label: "Maybe", hint: "I'll try my best", icon: HelpCircle, color: "#D97706" },
  { value: "REJECTED", label: "Can't make it", hint: "Regretfully decline", icon: XCircle, color: "#E11D48" },
];

function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function SectionTitle({ children, theme }: { children: ReactNode; theme: Theme }) {
  return (
    <p
      className="text-center text-[11px] font-semibold uppercase tracking-[0.28em]"
      style={{ color: theme.accent, fontFamily: FONT_FAMILY.sans }}
    >
      {children}
    </p>
  );
}

function splitDate(dateStr: string) {
  const date = new Date(`${dateStr}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return { weekday: "", day: dateStr, month: "", year: "" };
  }

  return {
    weekday: date.toLocaleDateString("en-IN", { weekday: "long" }),
    day: String(date.getDate()),
    month: date.toLocaleDateString("en-IN", { month: "long" }),
    year: String(date.getFullYear()),
  };
}

// ---------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------

export default function RespondToInvitation() {
  useInvitationFonts();

  const { token } = useParams<{ token: string }>();

  const { data: invitation, isLoading, isError, error } = useInvitationByToken(token);
  const submitMutation = useSubmitGuestResponse(token);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selected, setSelected] = useState<"ACCEPTED" | "MAYBE" | "REJECTED" | null>(null);

  const handleRespond = (value: "ACCEPTED" | "MAYBE" | "REJECTED") => {
    setSelected(value);
    setSubmitError(null);

    submitMutation.mutate(
      { response: value },
      {
        onError: (err) => {
          setSubmitError(getApiErrorMessage(err, "Couldn't submit your response. Please try again."));
          setSelected(null);
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center px-4 py-10"
        style={{ background: THEMES.festive.background }}
      >
        <div className="w-full max-w-md space-y-4">
          <Skeleton className="mx-auto h-4 w-40" />
          <Skeleton className="mx-auto h-10 w-64" />
          <Skeleton className="aspect-[3/4] w-full rounded-3xl" />
          <Skeleton className="h-32 w-full rounded-3xl" />
        </div>
      </div>
    );
  }

  if (isError || !invitation) {
    const message = getApiErrorMessage(error, "This invitation link is invalid or has expired.");

    return (
      <div
        className="flex min-h-screen items-center justify-center px-4 py-10"
        style={{ background: THEMES.festive.background }}
      >
        <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-xl">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
            <AlertCircle className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-lg font-bold text-[var(--brand-navy)]">Invitation not found</h1>
          <p className="mt-2 text-sm text-slate-500">{message}</p>
        </div>
      </div>
    );
  }

  const theme = themeFor(invitation.event_type);
  const cardImage = resolveMediaUrl(invitation.invitation_image);
  const coverImage = resolveMediaUrl(invitation.cover_image);

  const alreadyResponded = invitation.already_responded || submitMutation.isSuccess;
  const currentStatus: GuestResponseStatus =
    submitMutation.isSuccess && selected ? selected : invitation.response_status;
  const statusCopy = STATUS_COPY[currentStatus];

  const date = splitDate(invitation.event_date);
  const timeText = invitation.time_text || formatEventTime(invitation.event_time);
  const hostName = invitation.host_name;

  const mapsUrl =
    invitation.google_maps_link ||
    (invitation.venue_name || invitation.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          [invitation.venue_name, invitation.address].filter(Boolean).join(", ")
        )}`
      : "");

  const heroText = theme.onDark ? "#FFFFFF" : "#1F2A44";
  const mutedText = theme.onDark ? "rgba(255,255,255,0.72)" : "#64748B";

  return (
    <div
      className="relative min-h-screen overflow-x-hidden"
      style={{ background: theme.background, fontFamily: FONT_FAMILY.sans }}
    >
      <ThemeParticles theme={theme} />

      <div className="relative z-10 mx-auto w-full max-w-md px-4 pb-16 pt-10 sm:pt-14">
        {/* ---------------- Hero ---------------- */}
        <div className="text-center" style={{ color: heroText }}>
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="text-[11px] font-semibold uppercase tracking-[0.32em]"
            style={{ color: theme.accent }}
          >
            {theme.kicker}
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, scale: 0.9, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="mt-3 text-5xl leading-tight sm:text-6xl"
            style={{ fontFamily: theme.headingFont, fontWeight: theme.key === "romantic" ? 400 : 700 }}
          >
            You're Invited
          </motion.h1>

          <motion.div
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ duration: 0.9, delay: 0.5 }}
            className="mx-auto mt-4 flex items-center justify-center gap-3"
          >
            <span className="h-px w-14" style={{ background: `${theme.accent}88` }} />
            <Sparkles className="h-4 w-4" style={{ color: theme.accent }} />
            <span className="h-px w-14" style={{ background: `${theme.accent}88` }} />
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.7 }}
            className="mt-4 text-sm"
            style={{ color: mutedText }}
          >
            Dear <span className="font-semibold" style={{ color: heroText }}>{invitation.guest_name}</span>,
            {hostName ? (
              <>
                {" "}
                <span className="font-semibold" style={{ color: heroText }}>{hostName}</span> invites you
                to celebrate
              </>
            ) : (
              " you are warmly invited to"
            )}
          </motion.p>
        </div>

        {/* ---------------- Invitation card ---------------- */}
        <div className="mt-8" style={{ perspective: 1200 }}>
          <motion.div
            initial={{ opacity: 0, y: 50, rotateX: -14, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
            transition={{ duration: 1, delay: 0.55, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ y: -4 }}
            className="relative overflow-hidden rounded-3xl bg-white shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)] ring-1 ring-black/5"
          >
            {cardImage ? (
              <img
                src={cardImage}
                alt={`Invitation to ${invitation.event_name}`}
                className="block h-auto w-full"
              />
            ) : (
              <div
                className="relative flex aspect-[4/5] w-full flex-col items-center justify-center px-8 text-center text-white"
                style={{
                  background: coverImage
                    ? `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.55)), url(${coverImage}) center/cover`
                    : `linear-gradient(145deg, ${theme.accent}, ${theme.accentDark})`,
                }}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-white/80">
                  {invitation.event_type_label}
                </p>
                <h2
                  className="mt-4 text-4xl leading-tight"
                  style={{ fontFamily: theme.headingFont, fontWeight: theme.key === "romantic" ? 400 : 700 }}
                >
                  {invitation.event_name}
                </h2>
                <span className="my-5 block h-px w-16 bg-white/60" />
                <p className="text-sm font-semibold">
                  {date.weekday}, {date.day} {date.month} {date.year}
                </p>
                <p className="mt-1 text-sm text-white/85">{timeText}</p>
              </div>
            )}

            {/* slow shimmer sweep across the card */}
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 w-1/3 -skew-x-12"
              style={{
                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)",
              }}
              initial={{ left: "-40%" }}
              animate={{ left: "140%" }}
              transition={{ duration: 2.2, delay: 1.6, repeat: Infinity, repeatDelay: 5.5, ease: "easeInOut" }}
            />
          </motion.div>
        </div>

        {/* ---------------- Title ---------------- */}
        <Reveal className="mt-10 text-center" delay={0.05}>
          <span
            className="inline-block rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]"
            style={{ background: `${theme.accent}18`, color: theme.accent }}
          >
            {invitation.event_type_label}
          </span>
          <h2
            className="mt-3 text-3xl leading-tight"
            style={{
              color: heroText,
              fontFamily: theme.headingFont,
              fontWeight: theme.key === "romantic" ? 400 : 700,
            }}
          >
            {invitation.event_name}
          </h2>
          {invitation.description && (
            <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed" style={{ color: mutedText }}>
              {invitation.description}
            </p>
          )}
        </Reveal>

        {/* ---------------- When & where ---------------- */}
        <Reveal className="mt-8">
          <div className="overflow-hidden rounded-3xl bg-white shadow-[0_18px_40px_-22px_rgba(0,0,0,0.35)]">
            <div className="flex items-stretch gap-4 p-5">
              <div
                className="flex w-24 shrink-0 flex-col items-center justify-center rounded-2xl py-3 text-white"
                style={{ background: `linear-gradient(160deg, ${theme.accent}, ${theme.accentDark})` }}
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/80">
                  {date.month.slice(0, 3)}
                </span>
                <span className="text-4xl font-bold leading-none">{date.day}</span>
                <span className="mt-1 text-[11px] text-white/80">{date.year}</span>
              </div>

              <div className="flex min-w-0 flex-1 flex-col justify-center gap-3 text-[var(--brand-navy)]">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Date
                  </p>
                  <p className="text-base font-semibold">{date.weekday}</p>
                </div>
                <div>
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                    <Clock className="h-3 w-3" />
                    Time
                  </p>
                  <p className="text-base font-semibold">{timeText}</p>
                </div>
              </div>
            </div>

            {(invitation.venue_name || invitation.address) && (
              <div className="border-t border-slate-100 p-5">
                <div className="flex items-start gap-3">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                    style={{ background: `${theme.accent}15`, color: theme.accent }}
                  >
                    <MapPin className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1 text-[var(--brand-navy)]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                      Venue
                    </p>
                    {invitation.venue_name && (
                      <p className="text-base font-semibold">{invitation.venue_name}</p>
                    )}
                    {invitation.address && (
                      <p className="mt-0.5 text-sm text-slate-500">{invitation.address}</p>
                    )}
                  </div>
                </div>

                {mapsUrl && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 flex items-center justify-center gap-2 rounded-2xl border py-3 text-sm font-semibold transition-colors"
                    style={{ borderColor: `${theme.accent}55`, color: theme.accent }}
                  >
                    <Navigation className="h-4 w-4" />
                    Get directions
                  </a>
                )}
              </div>
            )}
          </div>
        </Reveal>

        {/* ---------------- Attendance ---------------- */}
        <Reveal className="mt-8">
          <div className="relative overflow-hidden rounded-3xl bg-white p-6 shadow-[0_18px_40px_-22px_rgba(0,0,0,0.35)]">
            <SectionTitle theme={theme}>Will you join us?</SectionTitle>

            <AnimatePresence mode="wait">
              {alreadyResponded ? (
                <motion.div
                  key="thanks"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  className="relative mt-5 flex flex-col items-center text-center"
                >
                  {currentStatus === "ACCEPTED" && <CelebrationBurst palette={theme.palette} />}

                  <motion.span
                    initial={{ scale: 0, rotate: -45 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.1 }}
                    className="flex h-16 w-16 items-center justify-center rounded-full"
                    style={{ background: `${statusCopy.tone}18`, color: statusCopy.tone }}
                  >
                    <statusCopy.icon className="h-9 w-9" />
                  </motion.span>
                  <p className="mt-3 text-lg font-bold text-[var(--brand-navy)]">{statusCopy.title}</p>
                  {statusCopy.message && (
                    <p className="mt-1 max-w-xs text-sm text-slate-500">{statusCopy.message}</p>
                  )}
                </motion.div>
              ) : (
                <motion.div key="choices" exit={{ opacity: 0, scale: 0.96 }} className="mt-4">
                  <p className="text-center text-sm text-slate-500">
                    {hostName ? `${hostName} would love to know.` : "The host would love to know."}
                  </p>

                  {submitError && (
                    <p className="mt-3 text-center text-sm text-rose-600" role="alert">
                      {submitError}
                    </p>
                  )}

                  <div className="mt-5 space-y-3">
                    {RESPONSE_OPTIONS.map((option, index) => {
                      const isPending = submitMutation.isPending && selected === option.value;

                      return (
                        <motion.button
                          key={option.value}
                          type="button"
                          disabled={submitMutation.isPending}
                          onClick={() => handleRespond(option.value)}
                          initial={{ opacity: 0, x: -16 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.45, delay: 0.1 + index * 0.1 }}
                          whileTap={{ scale: 0.97 }}
                          className="group flex w-full items-center gap-4 rounded-2xl border-2 px-4 py-3.5 text-left transition-all disabled:opacity-60"
                          style={{
                            borderColor: `${option.color}40`,
                            background: `${option.color}0d`,
                          }}
                        >
                          <span
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white"
                            style={{ background: option.color }}
                          >
                            {isPending ? (
                              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                            ) : (
                              <option.icon className="h-6 w-6" />
                            )}
                          </span>
                          <span className="flex-1">
                            <span className="block text-base font-semibold text-[var(--brand-navy)]">
                              {option.label}
                            </span>
                            <span className="block text-xs text-slate-500">{option.hint}</span>
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Reveal>

        {/* ---------------- Add to calendar ---------------- */}
        <Reveal className="mt-8">
          <div className="rounded-3xl bg-white p-6 shadow-[0_18px_40px_-22px_rgba(0,0,0,0.35)]">
            <SectionTitle theme={theme}>Save the date</SectionTitle>
            <p className="mt-2 text-center text-sm text-slate-500">
              One tap adds it to your calendar, with a reminder.
            </p>

            <div className="mt-4 grid gap-3">
              <a
                href={invitation.google_calendar_url}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold text-white shadow-md transition-transform active:scale-[0.98]"
                )}
                style={{ background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentDark})` }}
              >
                <CalendarPlus className="h-5 w-5" />
                Add to Google Calendar
              </a>

              <a
                href={invitation.calendar_url}
                className="flex items-center justify-center gap-2 rounded-2xl border-2 py-3.5 text-sm font-semibold transition-colors active:scale-[0.98]"
                style={{ borderColor: `${theme.accent}55`, color: theme.accent }}
              >
                <CalendarCheck className="h-5 w-5" />
                Apple / Outlook Calendar
              </a>
            </div>
          </div>
        </Reveal>

        <Reveal className="mt-10 text-center">
          <p className="text-xs" style={{ color: mutedText }}>
            Sent with love via LavernaEvents
          </p>
        </Reveal>
      </div>
    </div>
  );
}