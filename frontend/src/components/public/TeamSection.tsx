import { Mail, Phone } from "lucide-react";
import Reveal, { Stagger, StaggerItem } from "./Reveal";
import SectionHeading from "./SectionHeading";
import { TEAM, type TeamMember } from "./teamData";

// Photo-less members get a soft coloured backdrop, chosen by position.
const BACKDROPS = [
  "linear-gradient(135deg, #fbd5e6 0%, #fff0d1 100%)",
  "linear-gradient(135deg, #dcd3f2 0%, #fbd5e6 100%)",
  "linear-gradient(135deg, #d6f0cf 0%, #fff0d1 100%)",
  "linear-gradient(135deg, #fff0d1 0%, #dcd3f2 100%)",
];
const INITIAL_COLOURS = ["#ae0e5d", "#3a2266", "#3a8a29", "#c2410c"];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

// This version of lucide-react has no brand logos, so these two are drawn here.
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </svg>
  );
}

function LinkedinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M8 11v5M8 8v.01M12 16v-5M12 13a2.5 2.5 0 0 1 5 0v3" />
    </svg>
  );
}

function SocialLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      aria-label={label}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel="noopener noreferrer"
      className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-[var(--brand-navy)] shadow-sm transition-all hover:scale-110 hover:bg-[var(--brand-pink)] hover:text-white focus-visible:scale-110 focus-visible:bg-[var(--brand-pink)] focus-visible:text-white"
    >
      {children}
    </a>
  );
}

function MemberCard({ member, index }: { member: TeamMember; index: number }) {
  const { links } = member;
  const hasLinks = links && Object.values(links).some(Boolean);

  return (
    <article className="group h-full overflow-hidden rounded-3xl border border-slate-100 bg-white soft-shadow transition-all duration-300 hover:-translate-y-1.5 hover:soft-shadow-lg">
      <div
        className="relative aspect-[4/3.4] overflow-hidden sm:aspect-square"
        style={{ background: BACKDROPS[index % BACKDROPS.length] }}
      >
        {member.photo ? (
          <img
            src={member.photo}
            alt={member.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center" aria-hidden="true">
            <span className="absolute -left-8 -top-8 h-28 w-28 rounded-full border border-white/70" />
            <span className="absolute -bottom-10 -right-8 h-36 w-36 rounded-full border border-white/70" />
            <span
              className="flex h-24 w-24 items-center justify-center rounded-full bg-white text-3xl font-semibold shadow-md transition-transform duration-500 group-hover:scale-110"
              style={{ color: INITIAL_COLOURS[index % INITIAL_COLOURS.length] }}
            >
              {initials(member.name)}
            </span>
          </div>
        )}

        {hasLinks && (
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2 transition-all duration-300 sm:translate-y-3 sm:opacity-0 sm:group-focus-within:translate-y-0 sm:group-focus-within:opacity-100 sm:group-hover:translate-y-0 sm:group-hover:opacity-100">
            {links?.email && (
              <SocialLink href={`mailto:${links.email}`} label={`Email ${member.name}`}>
                <Mail className="h-4 w-4" />
              </SocialLink>
            )}
            {links?.phone && (
              <SocialLink href={`tel:${links.phone}`} label={`Call ${member.name}`}>
                <Phone className="h-4 w-4" />
              </SocialLink>
            )}
            {links?.linkedin && (
              <SocialLink href={links.linkedin} label={`${member.name} on LinkedIn`}>
                <LinkedinIcon className="h-4 w-4" />
              </SocialLink>
            )}
            {links?.instagram && (
              <SocialLink href={links.instagram} label={`${member.name} on Instagram`}>
                <InstagramIcon className="h-4 w-4" />
              </SocialLink>
            )}
          </div>
        )}
      </div>

      <div className="p-5 text-center">
        <h3 className="text-lg font-semibold tracking-tight text-[var(--brand-navy)]">{member.name}</h3>
        <p className="mt-0.5 text-sm font-medium text-[var(--brand-pink)]">{member.role}</p>
        <p className="mt-3 text-sm leading-relaxed text-slate-500">{member.bio}</p>
      </div>
    </article>
  );
}

export default function TeamSection() {
  if (TEAM.length === 0) return null;

  return (
    <section className="px-4 pb-16 sm:px-6 sm:pb-24 lg:px-8" aria-label="Our team">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <SectionHeading
            eyebrow="Our team"
            title="The people behind your celebration"
            description="A small team that cares about every invitation, every guest and every detail."
          />
        </Reveal>
        <Stagger className="mt-10 grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 lg:grid-cols-4" gap={0.08}>
          {TEAM.map((member, index) => (
            <StaggerItem key={member.name + index}>
              <MemberCard member={member} index={index} />
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}