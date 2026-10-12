import { RotateCcw } from "lucide-react";
import LegalPage, { type LegalSection } from "@/components/public/LegalPage";
import { siteConfig } from "@/lib/siteConfig";

const { name, contact } = siteConfig;

const SECTIONS: LegalSection[] = [
  {
    title: "What you buy",
    paragraphs: [
      `${name} sells digital services only: membership plans and topup packs (extra invitations or voice calls). They are delivered online and activated on your account as soon as the payment is confirmed. Nothing is shipped.`,
    ],
  },
  {
    title: "Cancelling",
    callout: "Plans never renew on their own, so you will not be charged again unless you choose to buy again.",
    items: [
      "Plans are one-time purchases for the period shown and do not renew automatically, so there is nothing to cancel to avoid future charges.",
      "You can stop using the Service at any time. A plan stays active until its end date.",
      "A payment cannot be cancelled once it has been confirmed and the plan or topup has been activated.",
    ],
  },
  {
    title: "When we refund",
    items: [
      "Your payment was debited but your plan or topup was not activated, and we cannot activate it.",
      "You were charged more than once for the same purchase.",
      "You were charged an amount different from the price shown at checkout.",
      "You ask within 7 days of buying a plan, and you have not yet sent any invitations or used any plan credits.",
    ],
  },
  {
    title: "When we do not refund",
    items: [
      "Topup packs after their credits have been added to your account.",
      "Plans that have been used, for example after invitations have been sent.",
      "Messages that could not be delivered because of incorrect contact details or the recipient's phone or settings.",
      "Accounts suspended or closed for breaking our Terms & Conditions.",
    ],
  },
  {
    title: "Failed or pending payments",
    paragraphs: [
      "If money is deducted from your bank account or UPI app but the payment shows as failed or pending, the amount is normally returned automatically by the payment gateway or your bank within 5 to 7 working days. If it is not, contact us with the date, amount and your order reference, and we will follow it up.",
    ],
  },
  {
    title: "How to ask for a refund",
    paragraphs: [
      `Email ${contact.email}${contact.phone ? ` or call ${contact.phone}` : ""} from the email address or mobile number on your account, with the order reference shown in Billing and the reason. We reply within 2 working days.`,
    ],
  },
  {
    title: "How refunds are paid",
    paragraphs: [
      "Approved refunds are sent to the original payment method (the same UPI account, card or bank account) and usually reach you within 5 to 7 working days after approval. The exact time depends on your bank.",
    ],
  },
  {
    title: "Contact",
    paragraphs: [
      `${name}, ${contact.location}. Email: ${contact.email}.${contact.phone ? ` Phone: ${contact.phone}.` : ""}`,
    ],
  },
];

export default function Refunds() {
  return (
    <LegalPage
      metaTitle="Refunds & Cancellations"
      metaDescription={`When ${name} refunds a payment, how cancellations work and how long refunds take.`}
      icon={RotateCcw}
      title="Refunds & Cancellations"
      intro="What happens if you want to cancel, or a payment goes wrong."
      updated="13 October 2026"
      sections={SECTIONS}
    />
  );
}