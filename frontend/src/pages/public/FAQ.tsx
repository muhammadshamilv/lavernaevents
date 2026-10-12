import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { HelpCircle, Search, SearchX } from "lucide-react";
import { usePageMeta } from "@/hooks/usePageMeta";
import { usePrimaryCta } from "@/hooks/usePrimaryCta";
import { cn } from "@/lib/utils";
import CtaBand from "@/components/public/CtaBand";
import FaqAccordion from "@/components/public/FaqAccordion";
import { FAQ_GROUPS } from "@/components/public/faqData";
import PageHero from "@/components/public/PageHero";
import Reveal from "@/components/public/Reveal";

// Tells search engines the questions and answers on this page, so they can
// show them directly in results. Mirrors exactly what visitors read.
function useFaqStructuredData() {
  useEffect(() => {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ_GROUPS.flatMap((group) => group.items).map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    });
    document.head.appendChild(script);
    return () => {
      document.head.removeChild(script);
    };
  }, []);
}

export default function FAQ() {
  usePageMeta(
    "FAQ",
    "Answers about creating an account, sending invitations, tracking RSVPs, sharing event photos, plans and payments."
  );
  useFaqStructuredData();
  const { primaryHref, primaryLabel, isSignedIn } = usePrimaryCta();
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();

  const groups = useMemo(() => {
    if (!needle) return FAQ_GROUPS;
    return FAQ_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => item.question.toLowerCase().includes(needle) || item.answer.toLowerCase().includes(needle)
      ),
    })).filter((group) => group.items.length > 0);
  }, [needle]);

  return (
    <div>
      <PageHero
        icon={HelpCircle}
        eyebrow="FAQ"
        title="Frequently asked questions"
        description="Quick answers about accounts, invitations, photos and billing."
      >
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the questions"
            aria-label="Search the questions"
            className="h-12 w-full rounded-full border-0 bg-white pl-11 pr-4 text-base text-[var(--brand-navy)] shadow-lg shadow-black/10 outline-none placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-[var(--brand-pink-light)]"
          />
        </div>
      </PageHero>

      <section className="px-4 py-12 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[14rem_1fr] lg:gap-16">
          {/* Category list: sticky beside the answers on large screens, a wrapped row of chips on phones. */}
          <nav aria-label="Question topics" className="lg:sticky lg:top-28 lg:self-start">
            <p className="mb-3 hidden text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 lg:block">
              Topics
            </p>
            <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
              {FAQ_GROUPS.map((group) => {
                const visible = groups.some((entry) => entry.id === group.id);
                return (
                  <li key={group.id}>
                    <a
                      href={`#${group.id}`}
                      aria-disabled={!visible}
                      className={cn(
                        "block rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-[var(--brand-pink)]/30 hover:text-[var(--brand-pink)] lg:rounded-xl lg:border-0 lg:bg-transparent lg:px-3 lg:hover:bg-[var(--brand-pink)]/8",
                        !visible && "pointer-events-none opacity-40"
                      )}
                    >
                      {group.title}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="space-y-10">
            {groups.map((group) => (
              <Reveal key={group.id}>
                <section id={group.id} className="scroll-mt-28">
                  <h2 className="text-xl font-semibold tracking-tight text-[var(--brand-navy)] sm:text-2xl">
                    {group.title}
                  </h2>
                  <div className="mt-3 rounded-3xl border border-slate-100 bg-white px-5 soft-shadow sm:px-8">
                    <FaqAccordion items={group.items} openFirst={!needle && group.id === FAQ_GROUPS[0].id} />
                  </div>
                </section>
              </Reveal>
            ))}

            {groups.length === 0 && (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center">
                <SearchX className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-4 font-semibold text-[var(--brand-navy)]">No questions match "{query.trim()}"</p>
                <p className="mt-1 text-sm text-slate-500">
                  Try a different word, or{" "}
                  <Link to="/contact" className="font-semibold text-[var(--brand-pink)] hover:underline">
                    ask us directly
                  </Link>
                  .
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <CtaBand
        title="Still have a question?"
        description="Send us a message and we'll get back to you."
        primary={{ label: "Contact us", to: "/contact" }}
        secondary={isSignedIn ? { label: primaryLabel, to: primaryHref } : { label: "Get started", to: "/register" }}
      />
    </div>
  );
}