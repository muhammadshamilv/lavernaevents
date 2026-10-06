import { useEffect } from "react";

const FONT_LINK_ID = "laverna-invitation-fonts";

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600;700" +
  "&family=Great+Vibes&family=Montserrat:wght@400;500;600;700" +
  "&family=Playfair+Display:wght@400;600;700&display=swap";

/**
 * Loads the invitation fonts (the same families the server uses to draw the
 * card) once, only on the pages that need them.
 */
export function useInvitationFonts(): void {
  useEffect(() => {
    if (document.getElementById(FONT_LINK_ID)) return;

    const link = document.createElement("link");
    link.id = FONT_LINK_ID;
    link.rel = "stylesheet";
    link.href = FONT_HREF;
    document.head.appendChild(link);
  }, []);
}

export const FONT_FAMILY = {
  serif: "'Playfair Display', Georgia, serif",
  script: "'Great Vibes', cursive",
  sans: "'Montserrat', system-ui, sans-serif",
  playful: "'Dancing Script', cursive",
} as const;