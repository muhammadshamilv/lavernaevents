import { cn } from "@/lib/utils";

// Slowly drifting colour glows and a faint dot texture, for dark brand
// bands (page heroes, call-to-action blocks). Purely decorative; sits behind
// the content and never takes clicks. The drift is a CSS animation, so it
// costs no JavaScript and stops for visitors who prefer reduced motion.
export default function Aurora({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div className="animate-aurora-a absolute -right-24 -top-32 h-[26rem] w-[26rem] rounded-full bg-[var(--brand-pink-light)]/30 blur-3xl will-change-transform" />
      <div className="animate-aurora-b absolute -bottom-44 -left-24 h-[28rem] w-[28rem] rounded-full bg-[var(--brand-green)]/20 blur-3xl will-change-transform" />
      <div className="animate-aurora-c absolute left-1/3 top-1/4 h-72 w-72 rounded-full bg-[var(--brand-gold)]/15 blur-3xl will-change-transform" />
      <div className="bg-dots-white absolute inset-0 opacity-70 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
    </div>
  );
}