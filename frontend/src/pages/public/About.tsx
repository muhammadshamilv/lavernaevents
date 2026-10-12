import { Link } from "react-router-dom";
import { ArrowRight, Heart, Lock, MapPin, MessageCircle, Smartphone, Users, type LucideIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePageMeta } from "@/hooks/usePageMeta";
import { usePrimaryCta } from "@/hooks/usePrimaryCta";
import { siteConfig } from "@/lib/siteConfig";
import Logo from "@/components/brand/Logo";
import CtaBand from "@/components/public/CtaBand";
import PageHero from "@/components/public/PageHero";
import Reveal, { Stagger, StaggerItem } from "@/components/public/Reveal";
import SectionHeading from "@/components/public/SectionHeading";
import SpotlightCard from "@/components/public/SpotlightCard";

// The brand's three words, from the logo itself.
const PILLARS: Array<{ word: string; description: string; colour: string }> = [
  {
    word: "Celebrate",
    description: "Make hosting a joy. Set up an event, send the invitations and let the platform do the chasing.",
    colour: "var(--brand-pink)",
  },
  {
    word: "Connect",
    description: "Bring everyone together, from the first message to the last dance, on the channels they already use.",
    colour: "var(--brand-navy)",
  },
  {
    word: "Cherish",
    description: "Keep the memories. Every photo lives in one gallery, and every guest can find their own.",
    colour: "var(--brand-green-dark)",
  },
];

const VALUES: Array<{ icon: LucideIcon; title: string; description: string }> = [
  {
    icon: Smartphone,
    title: "Simple for hosts, easy for guests",
    description: "Your guests never install anything or create an account. They open a link, reply and view photos.",
  },
  {
    icon: Lock,
    title: "Private by default",
    description: "An event's photos are shared only through its own QR code and link, and selfie search stays inside that event.",
  },
  {
    icon: MessageCircle,
    title: "Clear and honest",
    description: "Plans list their limits and prices openly on the Pricing page, and extra invitations are a clearly priced topup.",
  },
  {
    icon: Users,
    title: "Built with real celebrations in mind",
    description: "Big family weddings, milestone birthdays, company offsites. The tools are shaped by how events actually run.",
  },
];

export default function About() {
  usePageMeta(
    "About",
    "LavernaEvents helps hosts send digital invitations, track RSVPs and share event photos. Celebrate. Connect. Cherish."
  );
  const { primaryHref, primaryLabel, isSignedIn } = usePrimaryCta();

  return (
    <div>
      <PageHero
        icon={Heart}
        eyebrow="About us"
        title="We help you celebrate, and remember it"
        description="LavernaEvents was built to take the stress out of hosting, so you can spend your energy on the people who matter."
      >
        <Link
          to={isSignedIn ? primaryHref : "/contact"}
          className={cn(
            buttonVariants({ variant: "primary", size: "lg" }),
            "group bg-white text-[var(--brand-pink)] hover:bg-white/90"
          )}
        >
          {isSignedIn ? primaryLabel : "Talk to us"}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </PageHero>

      {/* Story */}
      <section className="px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-pink)]">Our story</p>
            <h2 className="mt-2 text-balance text-2xl font-semibold tracking-tight text-[var(--brand-navy)] sm:text-4xl">
              Hosting should feel like celebrating
            </h2>
            <div className="mt-5 space-y-4 text-slate-600 sm:text-lg">
              <p>
                Planning an event usually means a spreadsheet of names, a phone full of forwarded messages, and a
                shared folder nobody can find the good photos in.
              </p>
              <p>
                LavernaEvents puts all of that in one place. You build your guest list, send personal invitations
                on WhatsApp, email or SMS, watch the replies come in, and share every photo through a single gallery
                where each guest can find their own with a selfie.
              </p>
              <p>
                LavernaEvents is based in {siteConfig.contact.location}, and we are building it alongside the hosts
                who use it.
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.12}>
            <div
              className="relative overflow-hidden rounded-[2rem] border border-slate-100 p-8 text-center sm:p-12"
              style={{
                background:
                  "linear-gradient(135deg, rgba(212,20,114,0.07) 0%, rgba(240,180,41,0.10) 50%, rgba(76,175,55,0.10) 100%)",
              }}
            >
              <div className="animate-float-slow flex justify-center">
                <Logo size="xl" />
              </div>
              <p className="mt-6 text-sm font-semibold tracking-wide text-[var(--brand-pink)]">
                {siteConfig.tagline}
              </p>
              <p className="mt-4 flex items-center justify-center gap-1.5 text-sm text-slate-500">
                <MapPin className="h-4 w-4" />
                {siteConfig.contact.location}
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Three words */}
      <section className="px-4 pb-16 sm:px-6 sm:pb-24 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <SectionHeading
              eyebrow="What we stand for"
              title="Celebrate. Connect. Cherish."
              description="Three words from our logo that guide everything we build."
              align="center"
            />
          </Reveal>

          <Stagger className="mt-10 grid gap-4 md:grid-cols-3" gap={0.12}>
            {PILLARS.map((pillar, index) => (
              <StaggerItem key={pillar.word}>
                <SpotlightCard className="h-full p-6 sm:p-8">
                  <span className="text-sm font-semibold text-slate-400">0{index + 1}</span>
                  <h3 className="mt-3 text-2xl font-semibold tracking-tight" style={{ color: pillar.colour }}>
                    {pillar.word}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-500 sm:text-base">{pillar.description}</p>
                </SpotlightCard>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* Values */}
      <section className="px-4 pb-4 sm:px-6 lg:px-8">
        <div
          className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] px-6 py-12 text-white sm:px-12 sm:py-16"
          style={{
            background:
              "linear-gradient(135deg, var(--brand-navy-dark) 0%, var(--brand-navy) 55%, var(--brand-navy-light) 100%)",
          }}
        >
          <div className="pointer-events-none absolute -left-20 top-1/2 h-80 w-80 -translate-y-1/2 rounded-full bg-[var(--brand-pink)]/25 blur-3xl" />
          <div className="relative">
            <Reveal>
              <SectionHeading
                tone="light"
                eyebrow="How we work"
                title="The principles behind the product"
                description="What you can expect from us as a host or as a guest."
              />
            </Reveal>

            <Stagger className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2">
              {VALUES.map((value) => (
                <StaggerItem key={value.title}>
                  <div className="flex gap-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-[var(--brand-pink-light)] ring-1 ring-white/15">
                      <value.icon className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="font-semibold text-white">{value.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-white/70">{value.description}</p>
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </div>
      </section>

      <CtaBand
        title="Let's make your next event unforgettable"
        description="Questions, ideas or a big event to plan? We'd love to hear from you."
        primary={{ label: "Contact us", to: "/contact" }}
        secondary={{ label: "See features", to: "/features" }}
      />
    </div>
  );
}