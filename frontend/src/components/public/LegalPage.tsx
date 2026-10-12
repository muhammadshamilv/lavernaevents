import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUp, CalendarClock, Check, ChevronDown, Info, Mail, MapPin, Phone, Printer, type LucideIcon } from "lucide-react";
import { usePageMeta } from "@/hooks/usePageMeta";
import { siteConfig } from "@/lib/siteConfig";
import { cn } from "@/lib/utils";
import PageHero from "./PageHero";
import Reveal from "./Reveal";

export interface LegalSection {
  title: string;
  paragraphs?: string[];
  items?: string[];
  /** A highlighted note shown under the text, for the one thing readers must not miss. */
  callout?: string;
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

const OTHER_POLICIES = [
  { to: "/terms", label: "Terms & Conditions", hint: "Accounts, plans, payments and acceptable use" },
  { to: "/privacy", label: "Privacy Policy", hint: "What we collect and who we share it with" },
  { to: "/refunds", label: "Refunds & Cancellations", hint: "When we refund and how long it takes" },
];

function slug(text: string, index: number): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${index + 1}-${base}`;
}

// A policy page: contents list that follows the reader, numbered sections,
// links to the other policies and a contact card. Everything it shows comes
// from the `sections` array and siteConfig, so the text lives in one place.
export default function LegalPage({ metaTitle, metaDescription, icon, title, intro, updated, sections }: LegalPageProps) {
  usePageMeta(metaTitle, metaDescription);

  const ids = useMemo(() => sections.map((section, index) => slug(section.title, index)), [sections]);
  const [active, setActive] = useState(ids[0]);
  const [showTop, setShowTop] = useState(false);
  const { contact } = siteConfig;

  // Highlight the last section whose top edge has scrolled past the header,
  // and show the back-to-top button once the reader is well down the page.
  useEffect(() => {
    const onScroll = () => {
      let current = ids[0];
      for (const id of ids) {
        const element = document.getElementById(id);
        if (element && element.getBoundingClientRect().top <= 140) current = id;
      }
      setActive(current);
      setShowTop(window.scrollY > 900);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [ids]);

  const goTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  };

  const others = OTHER_POLICIES.filter((policy) => policy.to !== window.location.pathname);

  return (
    <>
      <div className="print:hidden">
        <PageHero eyebrow="Legal" icon={icon} title={title} description={intro}>
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white/90 ring-1 ring-white/20">
            <CalendarClock className="h-4 w-4" />
            Last updated {updated}
          </span>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white/90 ring-1 ring-white/20 transition-colors hover:bg-white/20"
          >
            <Printer className="h-4 w-4" />
            Print or save as PDF
          </button>
        </PageHero>
      </div>

      <div className="mx-auto hidden max-w-3xl px-4 pt-8 print:block">
        <h1 className="text-3xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{siteConfig.name} · Last updated {updated}</p>
      </div>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-14 lg:px-8">
        {/* Contents: a folding card on phones, a sticky list on large screens. */}
        <aside className="print:hidden lg:sticky lg:top-24 lg:self-start">
          <details className="group rounded-2xl border border-slate-100 bg-white soft-shadow lg:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-semibold text-[var(--brand-navy)] [&::-webkit-details-marker]:hidden">
              On this page
              <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
            </summary>
            <nav aria-label="On this page" className="border-t border-slate-100 px-2 py-2">
              {sections.map((section, index) => (
                <a
                  key={ids[index]}
                  href={`#${ids[index]}`}
                  onClick={(event) => {
                    event.preventDefault();
                    (event.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
                    goTo(ids[index]);
                  }}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50"
                >
                  <span className="w-5 text-xs font-semibold text-slate-400">{index + 1}</span>
                  {section.title}
                </a>
              ))}
            </nav>
          </details>

          <nav aria-label="On this page" className="hidden lg:block">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">On this page</p>
            <ul className="space-y-0.5 border-l border-slate-200">
              {sections.map((section, index) => {
                const isActive = active === ids[index];
                return (
                  <li key={ids[index]}>
                    <a
                      href={`#${ids[index]}`}
                      onClick={(event) => {
                        event.preventDefault();
                        goTo(ids[index]);
                      }}
                      aria-current={isActive ? "true" : undefined}
                      className={cn(
                        "-ml-px block border-l-2 py-1.5 pl-4 text-sm leading-snug transition-colors",
                        isActive
                          ? "border-[var(--brand-pink)] font-semibold text-[var(--brand-pink)]"
                          : "border-transparent text-slate-500 hover:border-slate-300 hover:text-[var(--brand-navy)]"
                      )}
                    >
                      {section.title}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>

        <div className="min-w-0 space-y-5 print:space-y-6">
          {sections.map((section, index) => (
            <Reveal key={ids[index]} y={14}>
              <section
                id={ids[index]}
                aria-labelledby={`${ids[index]}-title`}
                className="scroll-mt-24 rounded-3xl border border-slate-100 bg-white p-5 soft-shadow sm:p-8 print:rounded-none print:border-0 print:p-0 print:shadow-none"
              >
                <div className="flex items-start gap-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-pink)]/10 text-sm font-semibold text-[var(--brand-pink)] print:hidden">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h2 id={`${ids[index]}-title`} className="pt-1 text-lg font-semibold tracking-tight text-[var(--brand-navy)] sm:text-xl">
                    {section.title}
                  </h2>
                </div>

                <div className="mt-4 space-y-3.5 text-[15px] leading-relaxed text-slate-600 sm:pl-[3.25rem] print:pl-0">
                  {section.paragraphs?.map((paragraph) => (
                    <p key={paragraph} className="break-words">
                      {paragraph}
                    </p>
                  ))}

                  {section.items && (
                    <ul className="space-y-2.5">
                      {section.items.map((item) => (
                        <li key={item} className="flex items-start gap-3">
                          <span className="mt-1 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[var(--brand-green)]/15 text-[var(--brand-green-dark)]">
                            <Check className="h-3 w-3" strokeWidth={3} />
                          </span>
                          <span className="min-w-0 break-words">{item}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {section.callout && (
                    <div className="flex items-start gap-3 rounded-2xl bg-[var(--brand-pink)]/[0.06] px-4 py-3.5 text-sm text-[var(--brand-navy)]">
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-pink)]" />
                      <span className="break-words">{section.callout}</span>
                    </div>
                  )}
                </div>
              </section>
            </Reveal>
          ))}

          <Reveal y={14}>
            <div className="rounded-3xl p-6 text-white sm:p-8 print:hidden" style={{ background: "var(--gradient-brand)" }}>
              <h2 className="text-lg font-semibold sm:text-xl">Still have a question?</h2>
              <p className="mt-1.5 text-sm text-white/80">Write to us and a person will reply.</p>
              <ul className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                <li>
                  <a href={`mailto:${contact.email}`} className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15 transition-colors hover:bg-white/20">
                    <Mail className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 break-all">{contact.email}</span>
                  </a>
                </li>
                {contact.phone && (
                  <li>
                    <a href={`tel:${contact.phone}`} className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15 transition-colors hover:bg-white/20">
                      <Phone className="h-4 w-4 shrink-0" />
                      {contact.phone}
                    </a>
                  </li>
                )}
                <li className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15 sm:col-span-2">
                  <MapPin className="h-4 w-4 shrink-0" />
                  {contact.location}
                </li>
              </ul>
            </div>
          </Reveal>

          <nav aria-label="Other policies" className="grid gap-3 pt-2 sm:grid-cols-2 print:hidden">
            {others.map((policy) => (
              <Link
                key={policy.to}
                to={policy.to}
                className="group flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-white p-5 transition-all hover:-translate-y-0.5 hover:soft-shadow"
              >
                <span className="min-w-0">
                  <span className="block font-semibold text-[var(--brand-navy)]">{policy.label}</span>
                  <span className="mt-0.5 block text-sm text-slate-500">{policy.hint}</span>
                </span>
                <ArrowRight className="h-5 w-5 shrink-0 text-slate-300 transition-all group-hover:translate-x-1 group-hover:text-[var(--brand-pink)]" />
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label="Back to top"
        className={cn(
          "fixed bottom-5 right-5 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--brand-navy)] text-white shadow-lg transition-all duration-300 hover:bg-[var(--brand-pink)] print:hidden",
          showTop ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
        )}
        style={{ marginBottom: "var(--safe-area-inset-bottom)" }}
      >
        <ArrowUp className="h-5 w-5" />
      </button>
    </>
  );
}