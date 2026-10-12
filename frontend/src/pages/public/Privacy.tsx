import { ShieldCheck } from "lucide-react";
import LegalPage, { type LegalSection } from "@/components/public/LegalPage";
import { siteConfig } from "@/lib/siteConfig";

const { name, contact } = siteConfig;

const SECTIONS: LegalSection[] = [
  {
    title: "What this policy covers",
    paragraphs: [
      `This policy explains what personal information ${name} collects, why, and the choices you have. It covers organizers who sign up, and guests who receive an invitation or use a photo link.`,
    ],
  },
  {
    title: "Information we collect",
    items: [
      "Account details: your name, mobile number and email address, and your password (stored in a protected, hashed form).",
      "Event details you enter: event names, dates, places, and the guest names, mobile numbers and email addresses you add for invitations.",
      "Guest replies: RSVP answers and the number of people attending.",
      "Photos and videos uploaded to an event gallery.",
      "A selfie a guest chooses to submit, used only to find that guest's photos in the event gallery.",
      "Payment records: the plan or pack bought, the amount, the order and payment reference and its status. We do not receive or store your card, UPI PIN or bank account details.",
      "Basic technical data such as browser type and IP address, used for security and to prevent abuse.",
    ],
  },
  {
    title: "How we use it",
    items: [
      "To run the Service: create your account, send invitations, collect RSVPs and show galleries.",
      "To verify your mobile number and keep your account secure.",
      "To take payments and activate your plan or topup.",
      "To send you service messages such as one-time codes and payment confirmations.",
      "To prevent fraud and misuse, and to fix problems.",
    ],
  },
  {
    title: "Who we share it with",
    paragraphs: [
      "We do not sell your personal information. We share it only with service providers who help us run the Service, and only what they need to do that work:",
    ],
    items: [
      "Cashfree Payments, to process payments.",
      "Message and email providers, to deliver invitations, SMS, voice calls and email.",
      "Hosting and storage providers, to run the website and store data and files.",
      "Authorities, when the law requires it.",
    ],
  },
  {
    title: "Cookies",
    paragraphs: [
      "We use essential cookies to keep you signed in and to keep your account secure. We do not use advertising cookies.",
    ],
  },
  {
    title: "Keeping your information safe",
    paragraphs: [
      "We use encrypted connections (HTTPS), hashed passwords and access controls. No system is completely secure, so please keep your password private and tell us straight away if you think your account was misused.",
    ],
  },
  {
    title: "Your choices",
    paragraphs: [
      `You can view and update your details in Account settings. You can ask us to correct or delete your information, including a guest's details or photos, by contacting us at ${contact.email}. Guests who do not want to receive invitations can tell the organizer or us and we will help stop them.`,
    ],
  },
  {
    title: "Children",
    paragraphs: [
      "The Service is meant for adults who organize events. We do not knowingly collect personal information from children for their own accounts.",
    ],
  },
  {
    title: "Changes to this policy",
    paragraphs: [
      "We may update this policy from time to time. The date at the top shows when it last changed.",
    ],
  },
  {
    title: "Contact",
    paragraphs: [
      `For any privacy question or request, email ${contact.email}${contact.phone ? `, call ${contact.phone}` : ""}, or write to ${contact.location}.`,
    ],
  },
];

export default function Privacy() {
  return (
    <LegalPage
      metaTitle="Privacy Policy"
      metaDescription={`How ${name} collects, uses and protects personal information.`}
      icon={ShieldCheck}
      title="Privacy Policy"
      intro={`What ${name} collects, why, and the choices you have.`}
      updated="12 October 2026"
      sections={SECTIONS}
    />
  );
}