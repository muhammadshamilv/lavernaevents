import { useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FaqItem } from "./faqData";

function AccordionRow({ item, defaultOpen = false }: { item: FaqItem; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const reduceMotion = useReducedMotion();
  const panelId = useId();

  return (
    <div className="border-b border-slate-200/80 last:border-b-0">
      <h3>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center justify-between gap-4 py-5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-pink)]"
        >
          <span className="text-base font-semibold text-[var(--brand-navy)] sm:text-lg">{item.question}</span>
          <ChevronDown
            className={cn(
              "h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200",
              open && "rotate-180 text-[var(--brand-pink)]"
            )}
          />
        </button>
      </h3>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            role="region"
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            className="overflow-hidden"
          >
            <p className="max-w-2xl pb-5 text-sm leading-relaxed text-slate-600 sm:text-base">{item.answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function FaqAccordion({ items, openFirst = false }: { items: FaqItem[]; openFirst?: boolean }) {
  return (
    <div>
      {items.map((item, index) => (
        <AccordionRow key={item.question} item={item} defaultOpen={openFirst && index === 0} />
      ))}
    </div>
  );
}