import { FileText } from "lucide-react";
import LegalPage, { type LegalSection } from "@/components/public/LegalPage";
import { siteConfig } from "@/lib/siteConfig";

const { name, contact } = siteConfig;

const SECTIONS: LegalSection[] = [
  {
    title: "About these terms",
    paragraphs: [
      `These terms apply when you use ${name} (the "Service"), a website and app for creating events, sending digital invitations, collecting RSVPs and sharing event photos. By creating an account or using the Service you agree to them. If you do not agree, please do not use the Service.`,
    ],
  },
  {
    title: "Your account",
    items: [
      "There are two kinds of account: organizers, who create events, and photographers, who upload photos to events they are invited to.",
      "You must give accurate details and keep your login private.",
      "Accounts are verified with a one-time code sent to your mobile number.",
      "You are responsible for everything done through your account.",
      "Guests who receive an invitation do not need an account.",
    ],
  },
  {
    title: "Plans, topups and prices",
    paragraphs: [
      "The Service is offered through membership plans and optional topup packs (extra invitations or voice calls). Each plan lists what it includes, such as the number of events, invitations, voice calls and storage, together with its price and duration on our Pricing page.",
      "All prices are shown in Indian Rupees (INR). Any applicable taxes are shown before you pay. A plan is a one-time purchase for the period shown and does not renew automatically. When you upgrade, your current plan is replaced once the payment succeeds, and unused topup credits carry over.",
    ],
  },
  {
    title: "Payments",
    paragraphs: [
      "Payments are processed by Cashfree Payments, a licensed payment gateway, using UPI, cards and net banking. We never see or store your card, UPI PIN or bank details. Your plan or topup is activated after Cashfree confirms the payment. If a payment is debited but the plan is not activated, see our Refunds & Cancellations page.",
    ],
  },
  {
    title: "Photos and face search",
    paragraphs: [
      "Organizers and photographers may upload photos and videos to an event gallery. Where an event uses photo search, faces in those photos are analysed so guests can find their own pictures, as explained in our Privacy Policy.",
    ],
    items: [
      "Only upload photos and videos you have the right to share.",
      "Share an event's QR code or link only with people you want to see its photos, and let your guests know that photo search is available.",
      "Remove a photo, or tell us, if someone in it asks for it to be taken down.",
    ],
  },
  {
    title: "Acceptable use",
    items: [
      "Only invite people you have a reason to contact, and respect anyone who asks not to be contacted.",
      "Do not use the Service to send spam, unlawful, abusive or misleading messages.",
      "Do not upload unlawful content.",
      "Do not try to break, overload or gain unauthorised access to the Service.",
    ],
  },
  {
    title: "Your content",
    paragraphs: [
      "You keep ownership of the guest lists, invitations, photos and other content you add. You allow us to store, process and display it only as needed to run the Service for you, for example to send invitations or show your gallery to the guests you choose.",
    ],
  },
  {
    title: "Reviews",
    paragraphs: [
      "Anyone may send us a review through the website. We read reviews before they appear, and we may decline or remove any review, for example if it contains links, abuse or someone else's personal details. By sending a review you allow us to show the name, title, rating and text you entered on this website. You can ask us to remove your review at any time.",
    ],
  },
  {
    title: "Messages and third-party services",
    paragraphs: [
      "Invitations and reminders reach guests through SMS, email, voice calls and WhatsApp. SMS, email and voice calls are sent through our providers. For WhatsApp, the app opens WhatsApp on your device with the message ready and you send it yourself. We cannot guarantee delivery, because it also depends on the provider, the recipient's phone or settings and the details you entered.",
    ],
  },
  {
    title: "Availability and changes",
    paragraphs: [
      "We work to keep the Service available but it may occasionally be interrupted for maintenance or reasons outside our control. We may improve or change features, and may update these terms. Important changes will be shown on the Service. Continued use after a change means you accept it.",
    ],
  },
  {
    title: "Suspension and ending your account",
    paragraphs: [
      "We may suspend or close an account that breaks these terms or puts others at risk. You can stop using the Service at any time and may ask us to delete your account by contacting us.",
    ],
  },
  {
    title: "Limits on our responsibility",
    paragraphs: [
      `The Service is provided "as is". To the extent the law allows, ${name} is not liable for indirect or consequential losses, or for messages that could not be delivered. Our total liability for any claim is limited to the amount you paid us in the 12 months before the claim.`,
    ],
  },
  {
    title: "Governing law",
    paragraphs: [
      "These terms are governed by the laws of India. Courts at Kochi, Kerala have jurisdiction over any dispute.",
    ],
  },
  {
    title: "Contact",
    paragraphs: [
      `Questions about these terms? Email ${contact.email}${contact.phone ? `, call ${contact.phone}` : ""}, or write to us at ${contact.location}.`,
    ],
  },
];

export default function Terms() {
  return (
    <LegalPage
      metaTitle="Terms & Conditions"
      metaDescription={`The terms for using ${name}: accounts, plans, payments, photos and acceptable use.`}
      icon={FileText}
      title="Terms & Conditions"
      intro={`The rules for using ${name}, in plain language.`}
      updated="13 October 2026"
      sections={SECTIONS}
    />
  );
}