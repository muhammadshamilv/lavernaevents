// One place for brand text, contact details, social links and the public
// navigation, so the navbar, footer, contact page and FAQ never disagree.
//
// Contact details and social links come from build-time env vars (set them
// in Cloudflare Pages -> Settings -> Environment variables, and in your local
// frontend/.env). Anything left empty is simply not shown - the site never
// displays a placeholder phone number or a dead social link.

function clean(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  
  const env = import.meta.env;
  
  export const siteConfig = {
    name: "LavernaEvents",
    tagline: "Celebrate. Connect. Cherish.",
    defaultTitle: "LavernaEvents - Digital invitations, RSVPs and event photo sharing",
    defaultDescription:
      "Plan your event, send digital invitations on WhatsApp, email and SMS, track RSVPs, and let guests find their own photos with a selfie.",
    contact: {
      email: clean(env.VITE_CONTACT_EMAIL) ?? "hello@lavernaevents.com",
      phone: clean(env.VITE_CONTACT_PHONE),
      // Digits only, with country code, e.g. 919876543210
      whatsapp: clean(env.VITE_CONTACT_WHATSAPP)?.replace(/\D/g, "") ?? null,
      location: clean(env.VITE_CONTACT_LOCATION) ?? "Kochi, Kerala, India",
    },
    social: {
      instagram: clean(env.VITE_SOCIAL_INSTAGRAM),
      facebook: clean(env.VITE_SOCIAL_FACEBOOK),
      youtube: clean(env.VITE_SOCIAL_YOUTUBE),
      linkedin: clean(env.VITE_SOCIAL_LINKEDIN),
    },
  } as const;
  
  export interface NavLinkItem {
    to: string;
    label: string;
  }
  
  export const NAV_LINKS: NavLinkItem[] = [
    { to: "/features", label: "Features" },
    { to: "/pricing", label: "Pricing" },
    { to: "/gallery", label: "Gallery" },
    { to: "/about", label: "About" },
    { to: "/faq", label: "FAQ" },
    { to: "/contact", label: "Contact" },
  ];
  
  export function whatsappLink(number: string, text?: string): string {
    const query = text ? `?text=${encodeURIComponent(text)}` : "";
    return `https://wa.me/${number}${query}`;
  }