import { motion, useReducedMotion } from "framer-motion";
import { CalendarDays, Check, MapPin, MessageCircle, ScanFace } from "lucide-react";
import { cn } from "@/lib/utils";

// Illustrations built from CSS and SVG so the public site needs no stock
// photos. Everything here is decorative (aria-hidden) and uses sample data -
// no real guest, event or number is shown.

/* ---------------------------------------------------------------- QR glyph */

const QR_SIZE = 21;

function buildQrCells(): boolean[][] {
  let seed = 20240214;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  const inFinderZone = (x: number, y: number) =>
    (x < 8 && y < 8) || (x > QR_SIZE - 9 && y < 8) || (x < 8 && y > QR_SIZE - 9);

  return Array.from({ length: QR_SIZE }, (_, y) =>
    Array.from({ length: QR_SIZE }, (_, x) => (inFinderZone(x, y) ? false : random() > 0.52))
  );
}

const QR_CELLS = buildQrCells();
const FINDER_ORIGINS: Array<[number, number]> = [
  [0, 0],
  [QR_SIZE - 7, 0],
  [0, QR_SIZE - 7],
];

export function QrGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${QR_SIZE} ${QR_SIZE}`}
      className={className}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <rect width={QR_SIZE} height={QR_SIZE} fill="#fff" />
      {QR_CELLS.flatMap((row, y) =>
        row.map((on, x) => (on ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#241542" /> : null))
      )}
      {FINDER_ORIGINS.map(([fx, fy]) => (
        <g key={`${fx}-${fy}`}>
          <rect x={fx} y={fy} width="7" height="7" fill="#241542" />
          <rect x={fx + 1} y={fy + 1} width="5" height="5" fill="#fff" />
          <rect x={fx + 2} y={fy + 2} width="3" height="3" fill="#d41472" />
        </g>
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------ small cards */

export function RsvpCard({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("rounded-2xl border border-slate-100 bg-white p-4 soft-shadow-lg", className)}
    >
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span className="font-medium text-slate-500">Replies</span>
        <span>Sample</span>
      </div>
      <p className="mt-2 text-3xl font-semibold leading-none text-[var(--brand-navy)]">
        86 <span className="text-sm font-medium text-slate-400">attending</span>
      </p>
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-slate-100">
        <span className="h-full bg-[var(--brand-green)]" style={{ width: "66%" }} />
        <span className="h-full bg-[var(--brand-pink)]" style={{ width: "8%" }} />
        <span className="h-full bg-[var(--brand-gold)]" style={{ width: "26%" }} />
      </div>
      <div className="mt-3 space-y-1 text-xs text-slate-500">
        <p className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[var(--brand-green)]" /> 86 said yes
        </p>
        <p className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[var(--brand-pink)]" /> 9 said no
        </p>
        <p className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[var(--brand-gold)]" /> 34 yet to reply
        </p>
      </div>
    </div>
  );
}

export function QrPassCard({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("rounded-2xl border border-slate-100 bg-white p-3 text-center soft-shadow-lg", className)}
    >
      <QrGlyph className="mx-auto h-24 w-24 rounded-lg" />
      <p className="mt-2 text-xs font-semibold text-[var(--brand-navy)]">Guest pass</p>
      <p className="text-[11px] text-slate-400">Scan at the entrance</p>
    </div>
  );
}

export function AnalyticsCard({ className }: { className?: string }) {
  const bars = [38, 52, 44, 70, 62, 88, 76];

  return (
    <div
      aria-hidden="true"
      className={cn("rounded-2xl border border-slate-100 bg-white p-4 soft-shadow", className)}
    >
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span className="font-medium text-slate-500">Invitations sent</span>
        <span>Sample</span>
      </div>
      <div className="mt-3 flex h-20 items-end gap-1.5">
        {bars.map((height, index) => (
          <span
            key={index}
            className="flex-1 rounded-t-md"
            style={{
              height: `${height}%`,
              background:
                index === bars.length - 2
                  ? "var(--brand-pink)"
                  : "color-mix(in oklab, var(--brand-navy) 14%, white)",
            }}
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          ["240", "sent"],
          ["78%", "replied"],
          ["61", "checked in"],
        ].map(([value, label]) => (
          <div key={label}>
            <p className="text-base font-semibold text-[var(--brand-navy)]">{value}</p>
            <p className="text-[11px] text-slate-400">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- hero composition */

// The one orchestrated moment on the site: the pieces of an event arrive in
// order - invitation, delivery, RSVP tally, guest pass - then settle into a
// slow float. Under reduced motion they simply appear in place.
export function HeroVisual() {
  const reduceMotion = useReducedMotion();

  const enter = (delay: number, rotate: number, fromY = 28) =>
    reduceMotion
      ? { initial: false as const, animate: { opacity: 1, y: 0, rotate } }
      : {
          initial: { opacity: 0, y: fromY, rotate: rotate - 4 },
          animate: { opacity: 1, y: 0, rotate },
          transition: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] as const },
        };

  return (
    <div aria-hidden="true" className="relative mx-auto h-[27rem] w-full max-w-[22rem] sm:h-[31rem] sm:max-w-[28rem]">
      {/* Invitation card */}
      <div className="absolute left-1/2 top-6 w-[15.5rem] -translate-x-1/2 sm:w-[17.5rem]">
        {/* The float is a CSS animation on a wrapper: on the motion element it would overwrite framer's own transform. */}
        <div className="animate-float-slow">
        <motion.div {...enter(0.1, -2)} className="overflow-hidden rounded-3xl bg-white soft-shadow-lg">
          <div
            className="relative flex h-28 items-center justify-center overflow-hidden"
            style={{ background: "linear-gradient(135deg, #fbd5e6 0%, #fff0d1 100%)" }}
          >
            <span className="absolute -left-6 -top-8 h-24 w-24 rounded-full border border-[var(--brand-pink)]/25" />
            <span className="absolute -left-2 -top-4 h-16 w-16 rounded-full border border-[var(--brand-pink)]/25" />
            <span className="absolute -bottom-10 -right-6 h-28 w-28 rounded-full border border-[var(--brand-gold)]/50" />
            <span className="text-3xl font-light tracking-tight text-[var(--brand-navy)]">A &amp; R</span>
          </div>
          <div className="px-5 pb-5 pt-4 text-center">
            <p className="text-xs text-slate-400">Together with their families</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-[var(--brand-navy)]">Aanya &amp; Rohan</p>
            <p className="mt-1 text-xs text-slate-500">invite you to celebrate their wedding</p>
            <div className="mt-3 space-y-1 text-xs text-slate-600">
              <p className="flex items-center justify-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 text-[var(--brand-pink)]" />
                Saturday, 14 February, 6:30 pm
              </p>
              <p className="flex items-center justify-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-[var(--brand-pink)]" />
                Kochi
              </p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-semibold">
              <span className="flex h-9 items-center justify-center rounded-full bg-[var(--brand-pink)] text-white">
                I'll be there
              </span>
              <span className="flex h-9 items-center justify-center rounded-full border border-slate-200 text-slate-500">
                Can't make it
              </span>
            </div>
          </div>
        </motion.div>
        </div>
      </div>

      {/* Delivery bubble */}
      <motion.div
        {...enter(0.55, 3, 18)}
        className="absolute right-0 top-0 flex w-44 items-start gap-2 rounded-2xl rounded-tr-md bg-white p-3 soft-shadow-lg sm:w-52"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--brand-green)] text-white">
          <MessageCircle className="h-3.5 w-3.5" />
        </span>
        <span className="text-xs leading-snug text-slate-600">
          <span className="block font-semibold text-[var(--brand-navy)]">Invitation sent</span>
          Aanya &amp; Rohan's wedding
        </span>
      </motion.div>

      {/* RSVP tally */}
      <motion.div {...enter(0.8, 2)} className="absolute bottom-6 right-0 w-44 sm:w-48">
        <RsvpCard />
      </motion.div>

      {/* Guest pass */}
      <motion.div {...enter(1.05, -4)} className="absolute bottom-0 left-0 w-32 sm:w-36">
        <QrPassCard />
      </motion.div>
    </div>
  );
}

/* ----------------------------------------------------------- gallery mosaic */

interface Tile {
  label: string;
  className: string;
  background: string;
  motif: "arch" | "sun" | "rings" | "dots" | "wave";
}

const TILES: Tile[] = [
  { label: "The ceremony", className: "col-span-2 row-span-2", background: "linear-gradient(145deg,#2c1a52,#d41472)", motif: "arch" },
  { label: "Candid laughs", className: "", background: "linear-gradient(145deg,#f9a8d4,#fde68a)", motif: "sun" },
  { label: "Family", className: "row-span-2", background: "linear-gradient(160deg,#4caf37,#bef264)", motif: "rings" },
  { label: "Dance floor", className: "", background: "linear-gradient(145deg,#3a2266,#f0b429)", motif: "dots" },
  { label: "Décor", className: "", background: "linear-gradient(145deg,#fbcfe8,#c4b5fd)", motif: "wave" },
  { label: "The feast", className: "", background: "linear-gradient(145deg,#fdba74,#f43f5e)", motif: "sun" },
  { label: "Blessings", className: "", background: "linear-gradient(145deg,#a7f3d0,#3a8a29)", motif: "arch" },
  { label: "Last dance", className: "", background: "linear-gradient(145deg,#160c2b,#ae0e5d)", motif: "dots" },
];

function Motif({ kind }: { kind: Tile["motif"] }) {
  switch (kind) {
    case "arch":
      return <span className="absolute bottom-0 left-1/2 h-3/5 w-2/5 -translate-x-1/2 rounded-t-full bg-white/20" />;
    case "sun":
      return <span className="absolute right-[18%] top-[16%] h-1/3 w-1/3 rounded-full bg-white/35" />;
    case "rings":
      return (
        <>
          <span className="absolute -right-6 top-6 h-28 w-28 rounded-full border-2 border-white/30" />
          <span className="absolute -right-2 top-10 h-20 w-20 rounded-full border-2 border-white/30" />
        </>
      );
    case "dots":
      return (
        <span
          className="absolute inset-0 opacity-40"
          style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,.7) 1.5px, transparent 1.5px)", backgroundSize: "18px 18px" }}
        />
      );
    default:
      return <span className="absolute -bottom-6 -left-4 h-2/3 w-[120%] -rotate-6 rounded-[50%] bg-white/25" />;
  }
}

export function GalleryMosaic({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "grid grid-flow-dense auto-rows-[6.5rem] grid-cols-2 gap-3 sm:auto-rows-[9rem] sm:grid-cols-4",
        className
      )}
    >
      {TILES.map((tile) => (
        <div
          key={tile.label}
          className={cn("relative overflow-hidden rounded-2xl soft-shadow", tile.className)}
          style={{ background: tile.background }}
        >
          <Motif kind={tile.motif} />
          <span className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-[var(--brand-navy)]">
            {tile.label}
          </span>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------------------------- selfie search (phone) */

export function FaceSearchPhone({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "mx-auto w-[15rem] rounded-[2.5rem] border-[10px] border-[var(--brand-navy-dark)] bg-white shadow-2xl",
        className
      )}
    >
      <div className="mx-auto mt-2 h-1.5 w-14 rounded-full bg-slate-200" />
      <div className="px-4 pb-5 pt-4 text-center">
        <p className="text-sm font-semibold text-[var(--brand-navy)]">Find my photos</p>
        <p className="mt-0.5 text-xs text-slate-400">Look at the camera</p>

        <div className="relative mx-auto mt-4 h-36 w-36 overflow-hidden rounded-full bg-gradient-to-b from-[#fde4f0] to-[#e9defa]">
          <span className="absolute left-1/2 top-[18%] h-[46%] w-[40%] -translate-x-1/2 rounded-full bg-[var(--brand-navy)]/25" />
          <span className="absolute left-1/2 top-[62%] h-[60%] w-[75%] -translate-x-1/2 rounded-[50%] bg-[var(--brand-navy)]/25" />
          <span className="animate-scan absolute inset-x-0 h-0.5 bg-[var(--brand-pink)] shadow-[0_0_12px_2px_var(--brand-pink)]" />
        </div>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs font-semibold text-[var(--brand-green-dark)]">
          <Check className="h-3.5 w-3.5" />
          12 photos found
        </p>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {TILES.slice(1, 5).map((tile) => (
            <span key={tile.label} className="aspect-square rounded-lg" style={{ background: tile.background }} />
          ))}
        </div>
        <span className="mt-4 flex h-9 items-center justify-center gap-1.5 rounded-full bg-[var(--brand-pink)] text-xs font-semibold text-white">
          <ScanFace className="h-3.5 w-3.5" />
          Download my photos
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ extra visuals */

export function MiniMosaic({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("grid grid-cols-4 gap-2", className)}>
      {TILES.slice(0, 4).map((tile, index) => (
        <span
          key={tile.label}
          className={cn("relative aspect-square overflow-hidden rounded-xl", index === 0 && "rounded-tl-2xl")}
          style={{ background: tile.background }}
        >
          <Motif kind={tile.motif} />
        </span>
      ))}
    </div>
  );
}

export function EventSummaryCard({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("rounded-2xl border border-slate-100 bg-white p-5 soft-shadow-lg", className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-[var(--brand-navy)]">Aanya &amp; Rohan's wedding</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
            <CalendarDays className="h-3.5 w-3.5 text-[var(--brand-pink)]" />
            Saturday, 14 February, 6:30 pm
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
            <MapPin className="h-3.5 w-3.5 text-[var(--brand-pink)]" />
            Kochi
          </p>
        </div>
        <span className="rounded-full badge-success px-2.5 py-1 text-[11px] font-semibold">Upcoming</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          ["129", "guests"],
          ["240", "invitations"],
          ["3", "photographers"],
        ].map(([value, label]) => (
          <div key={label} className="rounded-xl bg-slate-50 py-2.5">
            <p className="text-lg font-semibold text-[var(--brand-navy)]">{value}</p>
            <p className="text-[11px] text-slate-400">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChannelsCard({ className }: { className?: string }) {
  const rows = [
    { label: "WhatsApp", detail: "Personal link to each guest", tone: "bg-[var(--brand-green)]" },
    { label: "Email", detail: "Full invitation card", tone: "bg-[var(--brand-navy)]" },
    { label: "SMS", detail: "Short message with the link", tone: "bg-[var(--brand-pink)]" },
    { label: "Voice call", detail: "A friendly reminder call", tone: "bg-[var(--brand-gold)]" },
  ];

  return (
    <div
      aria-hidden="true"
      className={cn("rounded-2xl border border-slate-100 bg-white p-4 soft-shadow-lg", className)}
    >
      <p className="text-xs font-medium text-slate-500">Send invitations on</p>
      <ul className="mt-3 space-y-2">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", row.tone)} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-[var(--brand-navy)]">{row.label}</span>
              <span className="block truncate text-xs text-slate-400">{row.detail}</span>
            </span>
            <Check className="h-4 w-4 shrink-0 text-[var(--brand-green)]" />
          </li>
        ))}
      </ul>
    </div>
  );
}