import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  hasError?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  length?: number;
  label?: string;
}

// One box per digit. Typing moves on by itself, Backspace steps back, the
// arrow keys move around, and pasting a whole code (or taking it from an SMS
// suggestion on a phone) fills every box at once.
export function OtpInput({
  value,
  onChange,
  hasError,
  autoFocus,
  disabled,
  length = 6,
  label = "Verification code",
}: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, index) => value[index] ?? "");

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const focusAt = (index: number) => {
    const target = refs.current[Math.max(0, Math.min(length - 1, index))];
    target?.focus();
    target?.select();
  };

  const commit = (next: string[]) => onChange(next.join("").slice(0, length));

  const handleChange = (index: number, raw: string) => {
    const typed = raw.replace(/\D/g, "");
    if (!typed) return;

    // Several digits at once (SMS autofill, or a fast typist): spread them out.
    const next = [...digits];
    typed.split("").forEach((digit, offset) => {
      if (index + offset < length) next[index + offset] = digit;
    });
    commit(next);
    focusAt(Math.min(index + typed.length, length - 1));
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace") {
      event.preventDefault();
      const next = [...digits];
      if (next[index]) {
        next[index] = "";
        commit(next);
      } else if (index > 0) {
        next[index - 1] = "";
        commit(next);
        focusAt(index - 1);
      }
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusAt(index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      focusAt(index + 1);
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    event.preventDefault();
    onChange(pasted);
    focusAt(Math.min(pasted.length, length - 1));
  };

  return (
    <div role="group" aria-label={label} className="space-y-2.5">
      <p className="text-sm font-medium text-[var(--brand-navy)]">{label}</p>
      <div className="flex justify-between gap-2 sm:gap-3">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            maxLength={length}
            value={digit}
            disabled={disabled}
            aria-label={`Digit ${index + 1} of ${length}`}
            onChange={(event) => handleChange(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onPaste={handlePaste}
            onFocus={(event) => event.target.select()}
            className={cn(
              "h-13 min-w-0 max-w-14 flex-1 rounded-2xl border bg-white text-center text-xl font-semibold text-[var(--brand-navy)] transition-all duration-150 sm:h-14",
              "focus:outline-none focus:ring-2 focus:ring-[var(--brand-pink)]/40 disabled:cursor-not-allowed disabled:opacity-50",
              hasError
                ? "border-rose-300 focus:ring-rose-300/40"
                : digit
                  ? "border-[var(--brand-pink)]/50 bg-[var(--brand-pink)]/[0.04]"
                  : "border-slate-300 focus:border-[var(--brand-pink)]"
            )}
          />
        ))}
      </div>
    </div>
  );
}