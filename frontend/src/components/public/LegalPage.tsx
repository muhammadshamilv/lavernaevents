import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { usePageMeta } from "@/hooks/usePageMeta";
import PageHero from "@/components/public/PageHero";

export interface LegalSection {
  title: string;
  paragraphs?: string[];
  items?: string[];
}

interface LegalPageProps {
  metaTitle: string;
  metaDescription: string;
  icon: LucideIcon;
  title: string;
  intro: string;
  updated: string;
  sections: LegalSection[];
}

const LEGAL_LINKS = [
  { to: "/terms", label: "Terms & Conditions" },
  { to: "/privacy", label: "Privacy Policy" },
  { to: "/refunds", label: "Refunds & Cancellations" },
  { to: "/contact", label: "Contact us" },
];

// Shared layout for the Terms, Privacy and Refund pages.
export default function LegalPage({
  metaTitle,
  metaDescription,
  icon,
  title,
  intro,
  updated,
  sections,
}: LegalPageProps) {
  usePageMeta(metaTitle, metaDescription);

  return (
    <div>
      <PageHero icon={icon} title={title} description={intro} />

      <section className="px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm text-slate-500">Last updated: {updated}</p>

          <div className="mt-8 space-y-9">
            {sections.map((section, index) => (
              <section key={section.title}>
                <h2 className="text-xl font-semibold text-[var(--brand-navy)]">
                  {index + 1}. {section.title}
                </h2>
                {section.paragraphs?.map((text) => (
                  <p key={text} className="mt-3 leading-7 text-slate-600">
                    {text}
                  </p>
                ))}
                {section.items && (
                  <ul className="mt-3 list-disc space-y-2 pl-6 leading-7 text-slate-600">
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>

          <nav
            aria-label="Related pages"
            className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-200 pt-6 text-sm"
          >
            {LEGAL_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="font-medium text-[var(--brand-pink)] hover:underline"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </section>
    </div>
  );
}