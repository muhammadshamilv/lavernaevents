import type { LucideIcon } from "lucide-react";

export interface MarqueeItem {
  icon?: LucideIcon;
  label: string;
}

// A slow, endless strip of short labels. The list is drawn twice and the
// track slides by exactly half its width, so the loop has no visible seam.
// It pauses on hover, and for visitors who prefer reduced motion it becomes
// an ordinary wrapped row.
export default function Marquee({ items, label }: { items: MarqueeItem[]; label: string }) {
  const row = (hidden: boolean) => (
    <ul
      className="flex shrink-0 items-center gap-3 pr-3 motion-reduce:flex-wrap motion-reduce:justify-center"
      aria-hidden={hidden || undefined}
      aria-label={hidden ? undefined : label}
    >
      {items.map(({ icon: Icon, label: text }) => (
        <li
          key={text}
          className="flex items-center gap-2 whitespace-nowrap rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 soft-shadow"
        >
          {Icon && <Icon className="h-4 w-4 text-[var(--brand-pink)]" />}
          {text}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="marquee-pause overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)] motion-reduce:[mask-image:none]">
      <div className="animate-marquee flex w-max motion-reduce:w-auto motion-reduce:justify-center">
        {row(false)}
        <div className="flex motion-reduce:hidden">{row(true)}</div>
      </div>
    </div>
  );
}