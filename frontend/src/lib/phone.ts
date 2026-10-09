/**
 * Turns whatever a person typed (or a phone's contact list returned) into the
 * form the server stores for a guest. Mirrors backend/guests/phone.py:
 *
 *   "+91 98765 43210", "098765 43210", "919876543210" -> "9876543210"
 *   "+44 7911 123456"                                  -> "447911123456"
 */
export function normalizeGuestMobile(raw: string): string {
    const text = (raw ?? "").replace(/[\s\-().]/g, "").trim();
    const digits = text.replace(/\D/g, "");
  
    if (!digits) return "";
  
    const stripIndiaCode = (value: string) =>
      value.length === 12 && value.startsWith("91") ? value.slice(2) : value;
  
    if (text.startsWith("+")) return stripIndiaCode(digits);
  
    if (digits.startsWith("00")) return stripIndiaCode(digits.slice(2));
  
    return stripIndiaCode(digits.replace(/^0+/, ""));
  }
  
  export function isValidGuestMobile(value: string): boolean {
    return /^\d{10,15}$/.test(value);
  }