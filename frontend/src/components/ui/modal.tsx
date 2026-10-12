import {
    useCallback,
    useEffect,
    useId,
    useRef,
    useState,
    type ReactNode,
    type PointerEvent as ReactPointerEvent,
  } from "react";
  import { createPortal } from "react-dom";
  import { AnimatePresence, motion, useDragControls, useReducedMotion } from "framer-motion";
  import { X, type LucideIcon } from "lucide-react";
  import { cn } from "@/lib/utils";
  
  // The one dialog every popup in the app is built on: confirmations, forms,
  // detail views. Centred card on larger screens, a bottom sheet on phones
  // (drag the handle down to dismiss). Closes on Escape or a tap outside,
  // keeps keyboard focus inside while open, locks the page behind it from
  // scrolling, and gives focus back to whatever opened it.
  
  export type ModalTone = "default" | "danger" | "success" | "warning";
  export type ModalSize = "sm" | "md" | "lg";
  
  const SIZE_CLASS: Record<ModalSize, string> = {
    sm: "sm:max-w-sm",
    md: "sm:max-w-lg",
    lg: "sm:max-w-2xl",
  };
  
  const TONE_ICON: Record<ModalTone, string> = {
    default: "bg-[var(--brand-pink)]/10 text-[var(--brand-pink)]",
    danger: "bg-rose-50 text-rose-600",
    success: "bg-emerald-50 text-emerald-600",
    warning: "bg-amber-50 text-amber-600",
  };
  
  const TONE_BAR: Record<ModalTone, string> = {
    default: "linear-gradient(90deg, var(--brand-pink), var(--brand-gold), var(--brand-green))",
    danger: "linear-gradient(90deg, #f43f5e, #e11d48)",
    success: "linear-gradient(90deg, var(--brand-green), var(--brand-green-light))",
    warning: "linear-gradient(90deg, var(--brand-gold), #f97316)",
  };
  
  const FOCUSABLE =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  
  // --- page scroll lock (shared, so stacked dialogs don't unlock early) ---
  
  let lockCount = 0;
  let savedOverflow = "";
  let savedPadding = "";
  
  function lockScroll() {
    if (lockCount === 0) {
      const scrollbar = window.innerWidth - document.documentElement.clientWidth;
      savedOverflow = document.body.style.overflow;
      savedPadding = document.body.style.paddingRight;
      document.body.style.overflow = "hidden";
      if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
    }
    lockCount += 1;
  }
  
  function unlockScroll() {
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      document.body.style.overflow = savedOverflow;
      document.body.style.paddingRight = savedPadding;
    }
  }
  
  function useIsPhone() {
    const [isPhone, setIsPhone] = useState(
      () => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches
    );
  
    useEffect(() => {
      const query = window.matchMedia("(max-width: 639px)");
      const update = () => setIsPhone(query.matches);
      query.addEventListener("change", update);
      return () => query.removeEventListener("change", update);
    }, []);
  
    return isPhone;
  }
  
  export interface ModalProps {
    open: boolean;
    onClose: () => void;
    title: string;
    description?: ReactNode;
    icon?: LucideIcon;
    tone?: ModalTone;
    size?: ModalSize;
    /** "center" stacks the icon above a centred title (alerts and confirmations). */
    align?: "left" | "center";
    /** Locks the dialog while something is saving: no Escape, no outside tap, no close button. */
    busy?: boolean;
    /** Set false to force a choice: the dialog only closes through its own buttons. */
    dismissible?: boolean;
    children?: ReactNode;
    /** Pinned under the content (usually the action buttons). */
    footer?: ReactNode;
    /** Called after the closing animation has finished. */
    onExited?: () => void;
  }
  
  function ModalSurface({
    onClose,
    title,
    description,
    icon: Icon,
    tone = "default",
    size = "md",
    align = "left",
    busy = false,
    dismissible = true,
    children,
    footer,
  }: Omit<ModalProps, "open" | "onExited">) {
    const reduceMotion = useReducedMotion();
    const isPhone = useIsPhone();
    const dragControls = useDragControls();
    const panelRef = useRef<HTMLDivElement>(null);
    const titleId = useId();
    const descriptionId = useId();
    const canClose = dismissible && !busy;
    const centered = align === "center";
  
    const requestClose = useCallback(() => {
      if (canClose) onClose();
    }, [canClose, onClose]);
  
    // Lock page scroll, move focus in, and give it back afterwards.
    useEffect(() => {
      const opener = document.activeElement as HTMLElement | null;
      lockScroll();
  
      const frame = requestAnimationFrame(() => {
        const panel = panelRef.current;
        if (!panel) return;
        const first = panel.querySelector<HTMLElement>("[data-autofocus], input, textarea, select");
        (first ?? panel).focus({ preventScroll: true });
      });
  
      return () => {
        cancelAnimationFrame(frame);
        unlockScroll();
        opener?.focus?.({ preventScroll: true });
      };
    }, []);
  
    // Escape closes; Tab stays inside the dialog.
    useEffect(() => {
      const onKey = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          requestClose();
          return;
        }
  
        if (event.key !== "Tab") return;
  
        const panel = panelRef.current;
        if (!panel) return;
  
        const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
          (el) => el.offsetParent !== null
        );
        if (items.length === 0) {
          event.preventDefault();
          panel.focus();
          return;
        }
  
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
  
        if (event.shiftKey && (active === first || active === panel)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      };
  
      document.addEventListener("keydown", onKey, true);
      return () => document.removeEventListener("keydown", onKey, true);
    }, [requestClose]);
  
    const startDrag = (event: ReactPointerEvent) => {
      if (isPhone && canClose) dragControls.start(event);
    };
  
    const panelMotion = reduceMotion
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.12 } }
      : isPhone
        ? {
            initial: { y: "100%" },
            animate: { y: 0 },
            exit: { y: "100%" },
            transition: { type: "spring" as const, damping: 34, stiffness: 380 },
          }
        : {
            initial: { opacity: 0, y: 16, scale: 0.96 },
            animate: { opacity: 1, y: 0, scale: 1 },
            exit: { opacity: 0, y: 10, scale: 0.97 },
            transition: { type: "spring" as const, damping: 28, stiffness: 340 },
          };
  
    return (
      <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4">
        <motion.div
          aria-hidden="true"
          className="absolute inset-0 bg-[var(--brand-navy-dark)]/55 backdrop-blur-[3px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={requestClose}
        />
  
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          tabIndex={-1}
          {...panelMotion}
          drag={isPhone && canClose && !reduceMotion ? "y" : false}
          dragControls={dragControls}
          dragListener={false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.7 }}
          onDragEnd={(_, info) => {
            if (info.offset.y > 110 || info.velocity.y > 650) requestClose();
          }}
          className={cn(
            "relative flex max-h-[92dvh] w-full flex-col overflow-hidden bg-white outline-none soft-shadow-lg",
            "rounded-t-[1.75rem] sm:max-h-[88dvh] sm:rounded-3xl",
            SIZE_CLASS[size]
          )}
        >
          <div aria-hidden="true" className="h-1 shrink-0" style={{ background: TONE_BAR[tone] }} />
  
          {/* Phone drag handle: the only part that starts a swipe-to-dismiss, so scrolling the content never closes it. */}
          <div
            aria-hidden="true"
            onPointerDown={startDrag}
            className={cn("flex shrink-0 touch-none justify-center pt-2.5 sm:hidden", canClose && "cursor-grab")}
          >
            <span className="h-1.5 w-10 rounded-full bg-slate-200" />
          </div>
  
          <div className={cn("flex shrink-0 gap-3.5 px-5 pb-1 pt-4 sm:px-6 sm:pt-6", centered ? "flex-col items-center text-center" : "items-start")}>
            {Icon && (
              <span
                className={cn(
                  "flex shrink-0 items-center justify-center rounded-2xl",
                  centered ? "h-14 w-14" : "h-11 w-11",
                  TONE_ICON[tone]
                )}
              >
                <Icon className={centered ? "h-7 w-7" : "h-5 w-5"} />
              </span>
            )}
  
            <div className={cn("min-w-0 flex-1", !centered && Icon && "pt-0.5")}>
              <h2 id={titleId} className="text-balance text-lg font-semibold tracking-tight text-[var(--brand-navy)] sm:text-xl">
                {title}
              </h2>
              {description && (
                <div id={descriptionId} className="mt-1.5 text-sm leading-relaxed text-slate-500">
                  {description}
                </div>
              )}
            </div>
  
            {dismissible && !centered && (
              <button
                type="button"
                onClick={requestClose}
                disabled={busy}
                aria-label="Close dialog"
                className="-mr-1.5 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-[var(--brand-navy)] disabled:opacity-40"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
  
          {children !== undefined && children !== null && (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-3 sm:px-6">{children}</div>
          )}
  
          {footer && (
            <div
              className="shrink-0 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:px-6"
              style={{ paddingBottom: "calc(1rem + var(--safe-area-inset-bottom))" }}
            >
              {footer}
            </div>
          )}
        </motion.div>
      </div>
    );
  }
  
  export function Modal({ open, onExited, ...props }: ModalProps) {
    // Rendered into <body> so no transformed or sticky ancestor can trap it.
    if (typeof document === "undefined") return null;
  
    return createPortal(
      <AnimatePresence onExitComplete={onExited}>{open && <ModalSurface key="modal" {...props} />}</AnimatePresence>,
      document.body
    );
  }
  
  // A row of buttons: stacked full-width on phones (primary first), side by
  // side on larger screens.
  export function ModalActions({ children, className }: { children: ReactNode; className?: string }) {
    return (
      <div
        className={cn(
          "flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end [&>*]:w-full sm:[&>*]:w-auto",
          className
        )}
      >
        {children}
      </div>
    );
  }