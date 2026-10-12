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
      "You must give accurate details and keep your login private.",
      "Organizer accounts are verified with a one-time code sent to your mobile number.",
      "You are responsible for everything done through your account.",
      "Guests who receive an invitation do not need an account.",
    ],
  },
  {
    title: "Plans, topups and prices",
    paragraphs: [
      "The Service is offered through membership plans and optional topup packs (extra invitations or voice calls). Each plan lists what it includes, such as the number of events, invitations, voice calls and storage, together with its price and duration on our Pricing page.",
      "All prices are shown in Indian Rupees (INR). Any applicable taxes are shown before you pay. A plan is a one-time purchase for the period shown and does not renew automatically. Topup credits are added to your active plan and carry over as described on the Billing page.",
    ],
  },
  {
    title: "Payments",
    paragraphs: [
      "Payments are processed by Cashfree Payments, a licensed payment gateway, using UPI (QR code, UPI apps), cards and net banking. We never see or store your card, UPI PIN or bank details. Your plan or topup is activated after Cashfree confirms the payment. If a payment is debited but the plan is not activated, see our Refunds & Cancellations page.",
    ],
  },
  {
    title: "Acceptable use",
    items: [
      "Only invite people you have a reason to contact, and respect anyone who asks not to be contacted.",
      "Do not use the Service to send spam, unlawful, abusive or misleading messages.",
      "Only upload photos and videos you have the right to share, and do not upload unlawful content.",
      "Do not try to break, overload or gain unauthorised access to the Service.",
    ],
  },
  {
    title: "Your content",
    paragraphs: [
      "You keep ownership of the guest lists, invitations, photos and other content you add. You allow us to store, process and display it only as needed to run the Service for you, for example to send invitations or show your gallery to guests you choose.",
    ],
  },
  {
    title: "Messages and third-party services",
    paragraphs: [
      "Invitations are delivered through third-party channels such as WhatsApp, SMS, email and voice calls. We cannot guarantee delivery, because it also depends on the provider, the recipient's phone or settings and the information you entered.",
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
      metaDescription={`The terms for using ${name}: accounts, plans, payments and acceptable use.`}
      icon={FileText}
      title="Terms & Conditions"
      intro={`The rules for using ${name}, in plain language.`}
      updated="12 October 2026"
      sections={SECTIONS}
    />
  );
}