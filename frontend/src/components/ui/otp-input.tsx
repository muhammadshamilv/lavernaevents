import * as React from "react";
import { cn } from "@/lib/utils";

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  hasError?: boolean;
  autoFocus?: boolean;
}

function OtpInput({
  length = 6,
  value,
  onChange,
  disabled,
  hasError,
  autoFocus,
}: OtpInputProps) {
  const inputsRef = React.useRef<Array<HTMLInputElement | null>>([]);

  const digits = React.useMemo(() => {
    const arr = value.split("").slice(0, length);
    while (arr.length < length) arr.push("");
    return arr;
  }, [value, length]);

  const focusBox = (index: number) => {
    inputsRef.current[Math.max(0, Math.min(index, length - 1))]?.focus();
  };

  const setDigit = (index: number, digit: string) => {
    const next = [...digits];
    next[index] = digit;
    onChange(next.join(""));
  };

  const handleChange = (index: number, raw: string) => {
    const clean = raw.replace(/\D/g, "");

    // 3+ digits at once = the phone's SMS auto-fill (or a paste) of the
    // whole code into one box.
    if (clean.length > 2) {
      const all = clean.slice(0, length);
      onChange(all);
      focusBox(all.length);
      return;
    }

    // Typing over a filled box gives two characters: keep the new one.
    const digit = clean.slice(-1);
    setDigit(index, digit);

    if (digit && index < length - 1) focusBox(index + 1);
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (digits[index]) {
        setDigit(index, "");
      } else if (index > 0) {
        focusBox(index - 1);
        setDigit(index - 1, "");
      }
    } else if (e.key === "ArrowLeft") {
      focusBox(index - 1);
    } else if (e.key === "ArrowRight") {
      focusBox(index + 1);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();

    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);

    if (!pasted) return;

    onChange(pasted);
    focusBox(pasted.length);
  };

  // The boxes share the available width (flex-1, capped), so six of them
  // always fit, even on a 320px phone inside a padded card.
  return (
    <div className="flex justify-center gap-1.5 sm:gap-3">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            inputsRef.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${index + 1} of ${length}`}
          autoFocus={autoFocus && index === 0}
          disabled={disabled}
          value={digit}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className={cn(
            "h-12 min-w-0 max-w-[3.5rem] flex-1 rounded-2xl border text-center text-lg font-semibold text-[var(--brand-navy)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--brand-pink)]/40 sm:h-14",
            hasError
              ? "border-rose-300 focus:ring-rose-300/40"
              : "border-slate-200 focus:border-[var(--brand-pink)]",
            disabled && "cursor-not-allowed opacity-50"
          )}
        />
      ))}
    </div>
  );
}

export { OtpInput };