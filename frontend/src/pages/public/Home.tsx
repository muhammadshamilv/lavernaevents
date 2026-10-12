import { Link } from "react-router-dom";
import {
  ArrowRight,
  Briefcase,
  Cake,
  CalendarPlus,
  CreditCard,
  Heart,
  Lock,
  Mail,
  MessageCircle,
  PhoneCall,
  QrCode,
  ScanFace,
  Send,
  Smartphone,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePageMeta } from "@/hooks/usePageMeta";
import { usePrimaryCta } from "@/hooks/usePrimaryCta";
import Aurora from "@/components/public/Aurora";
import CtaBand from "@/components/public/CtaBand";
import FaqAccordion from "@/components/public/FaqAccordion";
import { FAQ_GROUPS } from "@/components/public/faqData";
import Marquee, { type MarqueeItem } from "@/components/public/Marquee";
import PlansTeaser from "@/components/public/PlansTeaser";
import ReviewsSection from "@/components/public/ReviewsSection";
import TeamSection from "@/components/public/TeamSection";
import Reveal, { Stagger, StaggerItem, WordReveal } from "@/components/public/Reveal";
import SectionHeading from "@/components/public/SectionHeading";
import SpotlightCard from "@/components/public/SpotlightCard";
import {
  AnalyticsCard,
  FaceSearchPhone,
  HeroVisual,
  MiniMosaic,
  QrPassCard,
  RsvpCard,
} from "@/components/public/visuals";

const CHANNELS: Array<{ icon: LucideIcon; label: string }> = [
  { icon: MessageCircle, label: "WhatsApp" },
  { icon: Mail, label: "Email" },
  { icon: Smartphone, label: "SMS" },
  { icon: PhoneCall, label: "Voice call" },
];

const MARQUEE_ITEMS: MarqueeItem[] = [
  { icon: MessageCircle, label: "WhatsApp invitations" },
  { icon: Mail, label: "Email cards" },
  { icon: Smartphone, label: "SMS reminders" },
  { icon: PhoneCall, label: "Voice calls" },
  { icon: Users, label: "Live RSVP tracking" },
  { icon: QrCode, label: "QR guest passes" },
  { icon: ScanFace, label: "Selfie photo search" },
  { icon: Lock, label: "Private event galleries" },
];

const STEPS: Array<{ icon: LucideIcon; title: string; description: string }> = [
  {
    icon: CalendarPlus,
    title: "Create your event",
    description: "Add the date, venue and details, and pick the plan that fits your guest list.",
  },
  {
    icon: UserPlus,
    title: "Add your guests",
    description: "Build your guest list with phone numbers and emails, ready to invite in one go.",
  },
  {
    icon: Send,
    title: "Send invitations",
    description: "Choose a template and send it on WhatsApp, email or SMS. Every guest gets a personal link.",
  },
  {
    icon: Users,
    title: "Celebrate and share",
    description: "Check guests in with QR passes, then share every photo through one event gallery.",
  },
];

const EVENT_TYPES: Array<{ icon: LucideIcon; title: string; description: string; background: string }> = [
  {
    icon: Heart,
    title: "Weddings",
    description: "Multi-day celebrations with guest lists in the hundreds.",
    background: "linear-gradient(135deg, #d41472 0%, #ae0e5d 60%, #241542 100%)",
  },
  {
    icon: Cake,
    title: "Birthdays",
    description: "Milestone birthdays that are easy to plan and fun to host.",
    background: "linear-gradient(135deg, #f0b429 0%, #f97316 100%)",
  },
  {
    icon: Briefcase,
    title: "Corporate events",
    description: "Conferences, launches and team celebrations.",
    background: "linear-gradient(135deg, #3a2266 0%, #241542 100%)",
  },
  {
    icon: Users,
    title: "Community meetups",
    description: "Gatherings that bring people together locally.",
    background: "linear-gradient(135deg, #4caf37 0%, #3a8a29 100%)",
  },
];

const PROMISES: Array<{ icon: LucideIcon; title: string; description: string }> = [
  {
    icon: Smartphone,
    title: "Nothing for guests to install",
    description: "Guests open a personal link, reply and view photos right in their phone's browser.",
  },
  {
    icon: Lock,
    title: "Private by design",
    description: "Each event gallery is shared only through its own QR code and link, and face search stays inside that event.",
  },
  {
    icon: CreditCard,
    title: "Secure payments",
    description: "Plans are paid through Cashfree's secure checkout. Your card and UPI details never touch our servers.",
  },
];

const HOME_FAQS = [
  FAQ_GROUPS[0].items[0],
  FAQ_GROUPS[1].items[1],
  FAQ_GROUPS[2].items[0],
  FAQ_GROUPS[3].items[1],
];

export default function Home() {
  usePageMeta(null);
  const reduceMotion = useReducedMotion();
  const { primaryHref, primaryLabel, secondaryHref, secondaryLabel, isSignedIn } = usePrimaryCta();

  return (
    <div>
      {/* Hero */}
      <section
        className="relative overflow-hidden rounded-b-[2rem] text-white sm:rounded-b-[3rem]"
        style={{ background: "var(--gradient-brand)" }}
      >
        <Aurora />

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 sm:pb-24 sm:pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8 lg:px-8 lg:pb-28 lg:pt-20">
          <div>
            <motion.p
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-white/90 ring-1 ring-white/20 backdrop-blur-sm"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-green-light)]" />
              {"Celebrate · Connect · Cherish"}
            </motion.p>

            <h1 className="mt-6 text-balance text-[2.2rem] font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              <WordReveal
                delay={0.1}
                parts={[
                  { text: "Invitations, RSVPs and" },
                  { text: "photos", className: "text-gradient-brand" },
                  { text: "for every celebration" },
                ]}
              />
            </h1>

            <motion.p
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.7 }}
              className="mt-5 max-w-xl text-base text-white/80 sm:text-lg"
            >
              Send beautiful digital invitations, see who's coming as the replies arrive, and let your guests find
              their own photos afterwards with a selfie.
            </motion.p>

            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.85 }}
            >
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  to={primaryHref}
                  className={cn(
                    buttonVariants({ variant: "primary", size: "lg" }),
                    "group bg-white text-[var(--brand-pink)] shadow-lg shadow-black/10 hover:bg-white/90"
                  )}
                >
                  {isSignedIn ? primaryLabel : "Start planning"}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  to={isSignedIn ? "/pricing" : "/features"}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                    "border-white/40 bg-transparent text-white hover:bg-white/10"
                  )}
                >
                  {isSignedIn ? "View plans" : "See how it works"}
                </Link>
              </div>

              <ul className="mt-8 flex flex-wrap items-center gap-2" aria-label="Ways to send invitations">
                <li className="mr-1 text-sm text-white/65">Send on</li>
                {CHANNELS.map(({ icon: Icon, label }) => (
                  <li
                    key={label}
                    className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white ring-1 ring-white/20"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>

          <HeroVisual />
        </div>
      </section>

      {/* Capability strip */}
      <section className="py-10 sm:py-14" aria-label="What LavernaEvents covers">
        <Marquee items={MARQUEE_ITEMS} label="What LavernaEvents covers" />
      </section>

      {/* How it works - a real sequence, so the steps are numbered */}
      <section className="px-4 pb-16 pt-6 sm:px-6 sm:pb-24 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <SectionHeading
              eyebrow="How it works"
              title="From first invite to last photo"
              description="Four steps, and nothing for your guests to download or sign up for."
            />
          </Reveal>

          <Stagger className="relative mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6" gap={0.12}>
            <span
              aria-hidden="true"
              className="absolute left-[2.1rem] top-[2.1rem] hidden h-px w-[calc(100%-4rem)] bg-gradient-to-r from-[var(--brand-pink)]/40 via-[var(--brand-navy)]/20 to-[var(--brand-green)]/40 lg:block"
            />
            {STEPS.map((step, index) => (
              <StaggerItem key={step.title}>
                <div className="relative flex gap-4 lg:block">
                  <span className="relative z-10 flex h-[4.25rem] w-[4.25rem] shrink-0 items-center justify-center rounded-2xl bg-white text-[var(--brand-pink)] soft-shadow ring-1 ring-slate-100">
                    <step.icon className="h-6 w-6" />
                    <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--brand-navy)] text-xs font-semibold text-white">
                      {index + 1}
                    </span>
                  </span>
                  <div className="lg:mt-5">
                    <h3 className="text-lg font-semibold text-[var(--brand-navy)]">{step.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{step.description}</p>
                  </div>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* Everything in one place */}
      <section className="px-4 pb-16 sm:px-6 sm:pb-24 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <SectionHeading
              eyebrow="All in one place"
              title="Everything an event needs"
              description="Stop juggling forwarded messages, spreadsheets and shared drives."
              action={
                <Link to="/features" className="text-sm font-semibold text-[var(--brand-pink)] hover:underline">
                  Explore all features
                </Link>
              }
            />
          </Reveal>

          <Stagger className="mt-10 grid gap-4 lg:grid-cols-3" gap={0.07}>
            <StaggerItem className="lg:col-span-2">
              <SpotlightCard className="flex h-full flex-col justify-between p-6 sm:p-8">
                <div>
                  <h3 className="text-xl font-semibold text-[var(--brand-navy)]">Invitations that look the part</h3>
                  <p className="mt-2 max-w-md text-slate-500">
                    Pick a template, add your details, and send it to every guest on the channel they actually use.
                  </p>
                </div>
                <div className="mt-8 grid grid-cols-3 gap-3 sm:max-w-md" aria-hidden="true">
                  {[
                    "linear-gradient(160deg,#fbd5e6,#fff0d1)",
                    "linear-gradient(160deg,#241542,#d41472)",
                    "linear-gradient(160deg,#dcfce7,#fef3c7)",
                  ].map((background) => (
                    <span
                      key={background}
                      className="flex aspect-[3/4] items-end rounded-xl p-2 soft-shadow transition-transform duration-300 group-hover:-rotate-1"
                      style={{ background }}
                    >
                      <span className="h-1.5 w-1/2 rounded-full bg-white/70" />
                    </span>
                  ))}
                </div>
              </SpotlightCard>
            </StaggerItem>

            <StaggerItem>
              <SpotlightCard className="h-full p-6 sm:p-8">
                <h3 className="text-xl font-semibold text-[var(--brand-navy)]">Know who's coming</h3>
                <p className="mt-2 text-slate-500">Replies land on your dashboard the moment guests answer.</p>
                <RsvpCard className="mt-6 shadow-none ring-1 ring-slate-100" />
              </SpotlightCard>
            </StaggerItem>

            <StaggerItem>
              <SpotlightCard className="h-full p-6 sm:p-8">
                <h3 className="text-xl font-semibold text-[var(--brand-navy)]">Passes at the door</h3>
                <p className="mt-2 text-slate-500">Each guest gets a QR pass you can scan to check them in.</p>
                <QrPassCard className="mx-auto mt-6 w-36 shadow-none ring-1 ring-slate-100" />
              </SpotlightCard>
            </StaggerItem>

            <StaggerItem className="lg:col-span-2">
              <SpotlightCard className="flex h-full flex-col justify-between p-6 sm:p-8">
                <div>
                  <h3 className="text-xl font-semibold text-[var(--brand-navy)]">One gallery for every photo</h3>
                  <p className="mt-2 max-w-md text-slate-500">
                    Upload your own photos, or invite photographers to add theirs straight from the event.
                  </p>
                </div>
                <MiniMosaic className="mt-8 sm:max-w-md" />
              </SpotlightCard>
            </StaggerItem>

            <StaggerItem className="lg:col-span-3">
              <SpotlightCard className="grid items-center gap-6 p-6 sm:p-8 md:grid-cols-2">
                <div>
                  <h3 className="text-xl font-semibold text-[var(--brand-navy)]">See how it's going</h3>
                  <p className="mt-2 max-w-md text-slate-500">
                    Invitations sent, replies in, guests checked in. Your numbers update as things happen, so there is
                    nothing to add up by hand.
                  </p>
                </div>
                <AnalyticsCard className="shadow-none ring-1 ring-slate-100" />
              </SpotlightCard>
            </StaggerItem>
          </Stagger>
        </div>
      </section>

      {/* Selfie search spotlight */}
      <section className="px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div
            className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] text-white"
            style={{
              background:
                "linear-gradient(135deg, var(--brand-navy-dark) 0%, var(--brand-navy) 55%, var(--brand-navy-light) 100%)",
            }}
          >
            <Aurora />
            <div className="relative grid items-center gap-10 px-6 py-12 sm:px-12 sm:py-16 md:grid-cols-[0.8fr_1.2fr]">
              <FaceSearchPhone className="order-last md:order-first" />
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-pink-light)]">
                  Photo sharing
                </p>
                <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-4xl">
                  Guests find their own photos with a selfie
                </h2>
                <p className="mt-4 max-w-xl text-white/75 sm:text-lg">
                  After the event, guests scan your QR code, take a selfie and see only the photos they appear in. No
                  scrolling through thousands of pictures, and no messages asking you to send the good ones.
                </p>
                <ul className="mt-6 space-y-2.5 text-white/85">
                  {[
                    "Matches only against photos from your event",
                    "Photographers upload straight from their phones",
                    "Included on plans with QR guest passes",
                  ].map((line) => (
                    <li key={line} className="flex items-start gap-2.5">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-green-light)]" />
                      {line}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/features#photos"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                    "mt-8 border-white/40 bg-transparent text-white hover:bg-white/10"
                  )}
                >
                  See how photo sharing works
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* Event types */}
      <section className="px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <SectionHeading
              eyebrow="Every occasion"
              title="Built for every kind of celebration"
              description="The same tools work for a family function and a company offsite."
            />
          </Reveal>

          <Stagger className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {EVENT_TYPES.map((type) => (
              <StaggerItem key={type.title}>
                <div className="group h-full overflow-hidden rounded-3xl border border-slate-100 bg-white soft-shadow transition-all duration-300 [@media(hover:hover)]:hover:-translate-y-1 [@media(hover:hover)]:hover:shadow-xl">
                  <div
                    className="relative flex h-28 items-center justify-center overflow-hidden text-white"
                    style={{ background: type.background }}
                  >
                    <span className="absolute -right-6 -top-8 h-24 w-24 rounded-full border border-white/25 transition-transform duration-500 group-hover:scale-125" />
                    <span className="absolute -bottom-10 -left-6 h-28 w-28 rounded-full border border-white/20 transition-transform duration-500 group-hover:scale-125" />
                    <type.icon
                      className="relative h-9 w-9 transition-transform duration-300 group-hover:scale-110"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="p-5">
                    <h3 className="font-semibold text-[var(--brand-navy)]">{type.title}</h3>
                    <p className="mt-1 text-sm text-slate-500">{type.description}</p>
                  </div>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* Promises */}
      <section className="px-4 pb-16 sm:px-6 sm:pb-24 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <SectionHeading
              eyebrow="Peace of mind"
              title="Simple for you, easy for your guests"
              align="center"
            />
          </Reveal>
          <Stagger className="mt-10 grid gap-4 md:grid-cols-3">
            {PROMISES.map((promise) => (
              <StaggerItem key={promise.title}>
                <SpotlightCard className="h-full p-6 sm:p-8">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-pink)]/10 text-[var(--brand-pink)]">
                    <promise.icon className="h-6 w-6" />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold text-[var(--brand-navy)]">{promise.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">{promise.description}</p>
                </SpotlightCard>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* Plans */}
      <section className="px-4 pb-16 sm:px-6 sm:pb-24 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <SectionHeading
              eyebrow="Pricing"
              title="Plans that grow with your guest list"
              description="Start with what you need and upgrade whenever your event gets bigger."
              action={
                <Link to="/pricing" className="text-sm font-semibold text-[var(--brand-pink)] hover:underline">
                  Compare all plans
                </Link>
              }
            />
          </Reveal>
          <Reveal className="mt-10" delay={0.1}>
            <PlansTeaser />
          </Reveal>
        </div>
      </section>

      <ReviewsSection />

      <TeamSection />

      {/* FAQ teaser */}
      <section className="px-4 pb-4 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <Reveal>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-pink)]">FAQ</p>
            <h2 className="text-balance text-2xl font-semibold tracking-tight text-[var(--brand-navy)] sm:text-4xl">
              Questions people ask first
            </h2>
            <p className="mt-3 text-slate-500 sm:text-lg">
              Can't find yours?{" "}
              <Link to="/contact" className="font-semibold text-[var(--brand-pink)] hover:underline">
                Ask us directly
              </Link>
              .
            </p>
            <Link to="/faq" className="mt-5 inline-block text-sm font-semibold text-[var(--brand-pink)] hover:underline">
              Read all answers
            </Link>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="rounded-3xl border border-slate-100 bg-white px-5 soft-shadow sm:px-8">
              <FaqAccordion items={HOME_FAQS} />
            </div>
          </Reveal>
        </div>
      </section>

      <CtaBand
        title="Ready to plan your next celebration?"
        description="Set up your event in minutes and send your first invitation today."
        primary={{ label: isSignedIn ? primaryLabel : "Start planning", to: primaryHref }}
        secondary={{ label: secondaryLabel, to: secondaryHref }}
      />
    </div>
  );
}