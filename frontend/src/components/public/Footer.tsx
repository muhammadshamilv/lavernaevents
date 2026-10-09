import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import logo from "@/assets/laverna-logo.png";
import { siteConfig, whatsappLink } from "@/lib/siteConfig";

const LINK_GROUPS = [
  {
    title: "Product",
    links: [
      { label: "Features", to: "/features" },
      { label: "Pricing", to: "/pricing" },
      { label: "Gallery", to: "/gallery" },
      { label: "FAQ", to: "/faq" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", to: "/about" },
      { label: "Contact", to: "/contact" },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Get started", to: "/register" },
      { label: "Log in", to: "/login" },
    ],
  },
];

// Brand marks as outline icons (24x24, stroke) so they match the rest of
// the icon set without depending on a brand-icon package.
function BrandIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="19"
      height="19"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const SOCIAL_ICONS = {
  instagram: (
    <BrandIcon>
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </BrandIcon>
  ),
  facebook: (
    <BrandIcon>
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </BrandIcon>
  ),
  youtube: (
    <BrandIcon>
      <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
      <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
    </BrandIcon>
  ),
  linkedin: (
    <BrandIcon>
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </BrandIcon>
  ),
} as const;

const SOCIAL_LABELS = {
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  linkedin: "LinkedIn",
} as const;

type SocialKey = keyof typeof SOCIAL_LABELS;

function Footer() {
  const { contact, social } = siteConfig;
  const socialLinks = (Object.keys(SOCIAL_LABELS) as SocialKey[]).filter((key) => !!social[key]);

  return (
    <footer className="bg-[var(--brand-navy)] text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1.4fr] lg:px-10">
        <div className="md:col-span-2 lg:col-span-1">
          <Link to="/" className="inline-flex items-center" aria-label="LavernaEvents home">
            <img src={logo} alt="LavernaEvents" className="h-10 w-auto object-contain brightness-0 invert" />
          </Link>
          <p className="mt-4 max-w-xs text-sm leading-6 text-white/70">
            {siteConfig.tagline} Digital invitations, RSVPs and photo sharing for every kind of celebration.
          </p>

          {socialLinks.length > 0 && (
            <div className="mt-5 flex items-center gap-3">
              {socialLinks.map((key) => (
                <a
                  key={key}
                  href={social[key] ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={SOCIAL_LABELS[key]}
                  title={SOCIAL_LABELS[key]}
                  className="rounded-full border border-white/20 p-2.5 text-white/75 transition-colors hover:border-[var(--brand-green)] hover:text-[var(--brand-green)]"
                >
                  {SOCIAL_ICONS[key]}
                </a>
              ))}
            </div>
          )}
        </div>

        {LINK_GROUPS.map((group) => (
          <nav key={group.title} aria-label={group.title}>
            <h2 className="text-sm font-semibold text-white">{group.title}</h2>
            <div className="mt-4 flex flex-col items-start gap-3">
              {group.links.map((link) => (
                <Link
                  key={link.label}
                  to={link.to}
                  className="text-sm text-white/70 transition-colors hover:text-[var(--brand-pink-light)]"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </nav>
        ))}

        <div>
          <h2 className="text-sm font-semibold text-white">Contact</h2>
          <ul className="mt-4 space-y-3 text-sm text-white/70">
            <li className="flex items-start gap-2.5">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-white/50" />
              <a href={`mailto:${contact.email}`} className="break-all transition-colors hover:text-[var(--brand-pink-light)]">
                {contact.email}
              </a>
            </li>
            {contact.phone && (
              <li className="flex items-start gap-2.5">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-white/50" />
                <a
                  href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}
                  className="transition-colors hover:text-[var(--brand-pink-light)]"
                >
                  {contact.phone}
                </a>
              </li>
            )}
            {contact.whatsapp && (
              <li className="flex items-start gap-2.5">
                <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-white/50" />
                <a
                  href={whatsappLink(contact.whatsapp)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-[var(--brand-pink-light)]"
                >
                  Chat on WhatsApp
                </a>
              </li>
            )}
            <li className="flex items-start gap-2.5">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-white/50" />
              {contact.location}
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <p className="mx-auto max-w-7xl px-5 py-5 text-center text-xs text-white/55 sm:px-8 lg:px-10">
          © {new Date().getFullYear()} LavernaEvents. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

export default Footer;