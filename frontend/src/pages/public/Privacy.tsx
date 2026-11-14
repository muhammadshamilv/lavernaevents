import { ShieldCheck } from "lucide-react";
import LegalPage, { type LegalSection } from "@/components/public/LegalPage";
import { siteConfig } from "@/lib/siteConfig";

const { name, contact } = siteConfig;

const SECTIONS: LegalSection[] = [
  {
    title: "What this policy covers",
    paragraphs: [
      `This policy explains what personal information ${name} collects, why, who it is shared with, and the choices you have. It covers organizers and photographers who sign up, guests who receive an invitation, and anyone who uses an event's photo link.`,
    ],
  },
  {
    title: "Information we collect",
    items: [
      "Account details: your name, mobile number and email address, an optional profile photo, and your password (kept only in a hashed form we cannot read back).",
      "Event details you enter: event names, dates and places, and the names, mobile numbers and email addresses of the guests you add.",
      "Guest replies: the RSVP answers guests submit.",
      "Photos and videos uploaded to an event gallery.",
      "Records of the invitations and reminders sent from your account, so you can see their status.",
      "A review, if you choose to write one: the name you enter, an optional title, a star rating and your text.",
      "Payment records: the plan or pack bought, the amount, the order and payment reference and its status. We do not receive or store your card number, UPI PIN or bank account details.",
      "Basic technical data such as your IP address and browser type, used for security and to limit abuse.",
    ],
  },
  {
    title: "Photos, faces and selfies",
    paragraphs: [
      "When an event uses photo sharing, we scan the photos in its gallery for faces and keep a set of numbers describing each face in our database. This face data is used only so people at that event can find the photos they appear in, and it is removed when the photo is deleted.",
      "When a guest takes a selfie to search, the selfie is read in memory to find matching photos and is not saved. We keep only a simple count of how many searches and matches an event had. It is not linked to a name, an RSVP or an account.",
    ],
    callout:
      "Organizers choose which photos to upload and who receives the event's QR code or link. Photo search is available only to people who have that link.",
  },
  {
    title: "How we use it",
    items: [
      "To run the Service: create your account, send invitations, collect RSVPs and show galleries.",
      "To verify your mobile number and keep your account secure.",
      "To take payments and activate your plan or topup.",
      "To send you service messages such as one-time codes and payment confirmations.",
      "To show a review on this website, only after we have read and approved it.",
      "To prevent fraud and misuse, and to fix problems.",
    ],
  },
  {
    title: "Guest details you add",
    paragraphs: [
      "If you add guests, you decide who to invite and you are responsible for having a good reason to contact them. We handle their details only to provide the Service to you, such as sending the invitation and recording their reply. We do not use guest details for our own marketing.",
    ],
  },
  {
    title: "Who we share it with",
    paragraphs: [
      "We do not sell your personal information. We share it only with the service providers that help us run the Service, and only what each needs for its job:",
    ],
    items: [
      "Cashfree Payments, to process payments.",
      "Brevo (email), Fast2SMS (SMS) and Plivo (voice calls), to deliver the messages you send.",
      "Supabase (database and file storage), Render (servers) and Cloudflare (website delivery), to host the Service.",
      "Authorities, when the law requires it.",
    ],
    callout:
      "WhatsApp invitations are not sent by us. The app opens WhatsApp on your own device with the message ready, and you send it from your own account. WhatsApp's own terms and privacy policy apply to that message. Some of our providers may store or process data on servers outside India.",
  },
  {
    title: "Cookies",
    paragraphs: [
      "We use essential cookies to keep you signed in and your account secure. We do not use advertising cookies.",
    ],
  },
  {
    title: "How long we keep it",
    paragraphs: [
      "We keep your account details while your account is open. Events, guest lists and photos stay until you delete them or ask us to, and we do not delete them automatically, so please remove anything you no longer need. Payment records are kept for as long as the law and our accounting require.",
    ],
  },
  {
    title: "Keeping your information safe",
    paragraphs: [
      "We use encrypted connections (HTTPS), hashed passwords and access controls, and we limit how often sign-in and code requests can be made. No system is completely secure, so please keep your password private and tell us straight away if you think your account was misused.",
    ],
  },
  {
    title: "Your choices",
    paragraphs: [
      `You can view and update your name and photo in Account settings, and delete photos from a gallery yourself. To ask us to correct or delete other information, including a guest's details, your account or a review you wrote, email ${contact.email}. Where India's Digital Personal Data Protection Act, 2023 or other law gives you rights over your data, we will honour them. Guests who do not want to receive invitations can tell the organizer or us, and we will help stop them.`,
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
      metaDescription={`How ${name} collects, uses and protects personal information, including photos and face search.`}
      icon={ShieldCheck}
      title="Privacy Policy"
      intro={`What ${name} collects, why, who sees it, and the choices you have.`}
      updated="13 October 2026"
      sections={SECTIONS}
    />
  );
}