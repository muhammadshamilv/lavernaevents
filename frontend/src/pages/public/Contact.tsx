import { motion } from "framer-motion";
import { Mail, MapPin, Phone, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { siteConfig } from "@/lib/siteConfig";

interface ContactItem {
  icon: LucideIcon;
  label: string;
  value: string;
  href?: string;
}

export default function Contact() {
  const { contact } = siteConfig;

  // Details come from siteConfig (the VITE_CONTACT_* variables), the same
  // source the footer uses, so the two never disagree. Anything not set is
  // simply not shown.
  const items: ContactItem[] = [
    { icon: Mail, label: "Email", value: contact.email, href: `mailto:${contact.email}` },
    ...(contact.phone
      ? [
          {
            icon: Phone,
            label: "Phone",
            value: contact.phone,
            href: `tel:${contact.phone.replace(/[^\d+]/g, "")}`,
          },
        ]
      : []),
    { icon: MapPin, label: "Location", value: contact.location },
  ];

  return (
    <div className="gradient-mesh-subtle min-h-[70vh] px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <span className="inline-flex items-center rounded-full bg-[var(--brand-pink)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--brand-pink)]">Contact</span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-[var(--brand-navy)] sm:text-4xl">
            Get in touch
          </h1>
          <p className="mt-4 text-slate-500">
            Have a question, need help with a payment or want help planning your event? Reach out,
            we'd love to hear from you.
          </p>

          <div
            className={
              items.length === 3
                ? "mt-10 grid gap-4 sm:grid-cols-3"
                : "mt-10 grid gap-4 sm:grid-cols-2"
            }
          >
            {items.map(({ icon: Icon, label, value, href }) => (
              <Card key={label} className="card-hover-lift flex min-w-0 flex-col items-center gap-2 p-6">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-pink)]/10 text-[var(--brand-pink)]">
                  <Icon className="h-5 w-5" />
                </span>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
                {href ? (
                  <a href={href} className="break-words text-sm font-medium text-[var(--brand-navy)] transition-colors hover:text-[var(--brand-pink)]">
                    {value}
                  </a>
                ) : (
                  <p className="break-words text-sm font-medium text-[var(--brand-navy)]">{value}</p>
                )}
              </Card>
            ))}
          </div>

          <p className="mt-10 rounded-2xl bg-white/70 px-5 py-4 text-sm leading-relaxed text-slate-500 ring-1 ring-slate-100">
            See also our{" "}
            <a href="/terms" className="font-medium text-[var(--brand-pink)] hover:underline">
              Terms &amp; Conditions
            </a>
            ,{" "}
            <a href="/privacy" className="font-medium text-[var(--brand-pink)] hover:underline">
              Privacy Policy
            </a>{" "}
            and{" "}
            <a href="/refunds" className="font-medium text-[var(--brand-pink)] hover:underline">
              Refunds &amp; Cancellations
            </a>
            .
          </p>
        </motion.div>
      </div>
    </div>
  );
}