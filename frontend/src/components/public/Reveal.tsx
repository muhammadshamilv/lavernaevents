import type { ReactNode } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";

// Entrance animations for the public site. Everything here plays once, when
// the content scrolls into view, and renders as plain static markup for
// visitors who have asked their device to reduce motion.

const EASE = [0.22, 1, 0.36, 1] as const;

// A single quiet entrance for a block of content.
export default function Reveal({
  children,
  className,
  delay = 0,
  y = 18,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

const containerVariants = (gap: number, delay: number): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren: delay } },
});

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
};

// Wrap a grid in <Stagger> and each card in <StaggerItem>: the cards arrive
// one after another instead of all at once.
export function Stagger({
  children,
  className,
  gap = 0.08,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  gap?: number;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      variants={containerVariants(gap, delay)}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) return <div className={className}>{children}</div>;

  return (
    <motion.div className={className} variants={itemVariants}>
      {children}
    </motion.div>
  );
}

export interface WordPart {
  text: string;
  className?: string;
}

// A headline whose words rise into place one by one. Screen readers get the
// whole sentence as ordinary text; the animated words are hidden from them.
export function WordReveal({
  parts,
  className,
  delay = 0,
}: {
  parts: WordPart[];
  className?: string;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();
  const plain = parts.map((part) => part.text).join(" ");

  if (reduceMotion) {
    return (
      <span className={className}>
        {parts.map((part, index) => (
          <span key={index} className={part.className}>
            {part.text}{" "}
          </span>
        ))}
      </span>
    );
  }

  let counter = 0;

  return (
    <span className={className}>
      <span className="sr-only">{plain}</span>
      <span aria-hidden="true">
        {parts.flatMap((part, partIndex) =>
          part.text.split(" ").map((word) => {
            const index = counter++;
            return (
              <span
                key={`${partIndex}-${index}`}
                className="-mb-[0.14em] inline-block overflow-hidden pb-[0.14em] align-bottom"
              >
                <motion.span
                  className={cn("inline-block", part.className)}
                  initial={{ y: "110%" }}
                  animate={{ y: 0 }}
                  transition={{ duration: 0.7, delay: delay + index * 0.07, ease: EASE }}
                >
                  {word}&nbsp;
                </motion.span>
              </span>
            );
          })
        )}
      </span>
    </span>
  );
}