import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Camera,
  Check,
  ClipboardCheck,
  CreditCard,
  HardDrive,
  Images,
  LayoutTemplate,
  Mail,
  PackagePlus,
  PhoneCall,
  QrCode,
  ScanFace,
  Smartphone,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePageMeta } from "@/hooks/usePageMeta";
import { usePrimaryCta } from "@/hooks/usePrimaryCta";
import CtaBand from "@/components/public/CtaBand";
import PageHero from "@/components/public/PageHero";
import Reveal, { Stagger, StaggerItem } from "@/components/public/Reveal";
import SectionHeading from "@/components/public/SectionHeading";
import SpotlightCard from "@/components/public/SpotlightCard";
import {
  ChannelsCard,
  EventSummaryCard,
  FaceSearchPhone,
  GalleryMosaic,
  QrPassCard,
  RsvpCard,
} from "@/components/public/visuals";

const JUMP_LINKS = [
  { href: "#invitations", label: "Invitations" },
  { href: "#rsvps", label: "RSVPs" },
  { href: "#passes", label: "Guest passes" },
  { href: "#photos", label: "Photo gallery" },
  { href: "#face-search", label: "Selfie search" },
];

const DETAILS: Array<{ icon: LucideIcon; title: string; description: string }> = [
  {
    icon: LayoutTemplate,
    title: "Invitation templates",
    description: "Start from a ready-made design and add your event details.",
  },
  {
    icon: PhoneCall,
    title: "Voice call reminders",
    description: "On plans that include them, a friendly reminder call to your guests.",
  },
  {
    icon: PackagePlus,
    title: "Topup packs",
    description: "Running low on invitations? Add more any time without changing plan.",
  },
  {
    icon: Camera,
    title: "Photographer access",
    description: "Invite photographers to upload to your event without seeing the rest of your account.",
  },
  {
    icon: HardDrive,
    title: "Clear storage limits",
    description: "Every plan lists its photo storage up front, so there are no surprises.",
  },
  {
    icon: Smartphone,
    title: "Made for phones",
    description: "Every page works from a mobile browser, for you and for your guests.",
  },
  {
    icon: CreditCard,
    title: "Secure checkout",
    description: "Pay with UPI, card or netbanking through Cashfree's secure payment page.",
  },
  {
    icon: Users,
    title: "Guest lists",
    description: "Keep every guest, contact detail and reply in one organised place.",
  },
];

function FeatureRow({
  id,
  icon: Icon,
  eyebrow,
  title,
  description,
  points,
  visual,
  reverse = false,
  tint = "pink",
}: {
  id: string;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  points: string[];
  visual: ReactNode;
  reverse?: boolean;
  tint?: "pink" | "green" | "navy";
}) {
  const panel = {
    pink: "linear-gradient(135deg, rgba(212,20,114,0.08) 0%, rgba(240,180,41,0.10) 100%)",
    green: "linear-gradient(135deg, rgba(76,175,55,0.10) 0%, rgba(212,20,114,0.06) 100%)",
    navy: "linear-gradient(135deg, rgba(36,21,66,0.08) 0%, rgba(212,20,114,0.08) 100%)",
  }[tint];

  return (
    <section id={id} className="scroll-mt-24 px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <Reveal className={cn(reverse && "lg:order-2")}>
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-pink)]/10 text-[var(--brand-pink)]">
            <Icon className="h-6 w-6" />
          </span>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-pink)]">{eyebrow}</p>
          <h2 className="mt-2 text-balance text-2xl font-semibold tracking-tight text-[var(--brand-navy)] sm:text-4xl">
            {title}
          </h2>
          <p className="mt-4 max-w-xl text-slate-500 sm:text-lg">{description}</p>
          <ul className="mt-6 space-y-3">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-3 text-slate-600">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand-green)]/15 text-[var(--brand-green-dark)]">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={0.12} className={cn(reverse && "lg:order-1")}>
          <div
            className="relative overflow-hidden rounded-[2rem] border border-slate-100 p-6 sm:p-10"
            style={{ background: panel }}
          >
            <div className="relative">{visual}</div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default function Features() {
  usePageMeta(
    "Features",
    "Digital invitations on WhatsApp, email and SMS, live RSVP tracking, QR guest passes and a photo gallery where guests find their own pictures with a selfie."
  );
  const { primaryHref, primaryLabel, secondaryHref, secondaryLabel, isSignedIn } = usePrimaryCta();

  return (
    <div>
      <PageHero
        icon={Sparkles}
        eyebrow="Features"
        title="Everything you need to host a celebration people remember"
        description="From the first invitation to the last photo, LavernaEvents keeps every part of your event in one place."
      >
        <nav aria-label="Jump to a feature" className="flex flex-wrap gap-2">
          {JUMP_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/25 transition-colors hover:bg-white/20"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </PageHero>

      <FeatureRow
        id="invitations"
        icon={Mail}
        eyebrow="Invitations"
        title="Reach every guest on the app they already use"
        description="Pick a template, add your event details and send. Each guest gets a personal link, so replies always find their way back to you."
        points={[
          "Send over WhatsApp, email and SMS",
          "Voice call reminders on plans that include them",
          "Choose how many invitations you need, and top up any time",
        ]}
        visual={<ChannelsCard className="mx-auto max-w-sm" />}
      />

      <FeatureRow
        id="rsvps"
        icon={ClipboardCheck}
        eyebrow="RSVPs"
        title="See who's coming without chasing anyone"
        description="Guests answer from their invitation, with no account to create. You see the reply the moment it arrives."
        points={[
          "Live count of who said yes, no, or hasn't answered",
          "One dashboard for every guest and every event",
          "Know exactly who to follow up with",
        ]}
        reverse
        tint="green"
        visual={
          <div className="mx-auto grid max-w-md gap-4">
            <EventSummaryCard />
            <RsvpCard />
          </div>
        }
      />

      <FeatureRow
        id="passes"
        icon={QrCode}
        eyebrow="Guest passes"
        title="A QR pass for every guest"
        description="Each guest gets a QR pass. Scan it at the door to check them in, and keep a clear record of who arrived."
        points={[
          "Scan to check guests in",
          "No printing needed - passes work from a phone screen",
          "Available on plans that include QR guest passes",
        ]}
        tint="navy"
        visual={<QrPassCard className="mx-auto w-44 sm:w-52" />}
      />

      <FeatureRow
        id="photos"
        icon={Images}
        eyebrow="Photo gallery"
        title="One gallery for every photo from your event"
        description="Upload your own photos, or invite photographers to add theirs straight from the event. Guests open the gallery with your event's QR code."
        points={[
          "Photographers get a simple upload page of their own",
          "Shared only through your event's QR code and link",
          "Storage is listed on every plan, so you know what you get",
        ]}
        reverse
        visual={<GalleryMosaic />}
      />

      <FeatureRow
        id="face-search"
        icon={ScanFace}
        eyebrow="Selfie search"
        title="Guests find their own photos with a selfie"
        description="Nobody wants to scroll through a thousand pictures. A guest takes one selfie and sees only the photos they appear in."
        points={[
          "Looks only inside that one event's photos",
          "Guests download the photos they like, with no account needed",
          "Included on plans with QR guest passes and face search",
        ]}
        tint="green"
        visual={<FaceSearchPhone />}
      />

      <section className="px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <SectionHeading
              eyebrow="And more"
              title="The details that make it feel finished"
              description="Small things that save you time before, during and after the event."
              align="center"
            />
          </Reveal>

          <Stagger className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {DETAILS.map((item) => (
              <StaggerItem key={item.title}>
                <SpotlightCard className="h-full p-6">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--brand-pink)]/10 text-[var(--brand-pink)]">
                    <item.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 font-semibold text-[var(--brand-navy)]">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{item.description}</p>
                </SpotlightCard>
              </StaggerItem>
            ))}
          </Stagger>

          <Reveal className="mt-10 flex justify-center">
            <Link to="/pricing" className={buttonVariants({ variant: "outline", size: "lg" })}>
              Compare plans
            </Link>
          </Reveal>
        </div>
      </section>

      <CtaBand
        title="See it for yourself"
        description="Create your first event and send a test invitation in a few minutes."
        primary={{ label: isSignedIn ? primaryLabel : "Get started", to: primaryHref }}
        secondary={{ label: secondaryLabel, to: secondaryHref }}
      />
    </div>
  );
}