export interface FaqItem {
    question: string;
    answer: string;
  }
  
  export interface FaqGroup {
    id: string;
    title: string;
    items: FaqItem[];
  }
  
  // Answers describe what the product does today. If a feature changes,
  // change it here - the FAQ page and the home page teaser both read this.
  export const FAQ_GROUPS: FaqGroup[] = [
    {
      id: "getting-started",
      title: "Getting started",
      items: [
        {
          question: "How do I create an account?",
          answer:
            "Choose Get started, enter your details, and confirm your mobile number with the one-time code we send by SMS. After that you pick a plan and can create your first event.",
        },
        {
          question: "Why do you need my mobile number?",
          answer:
            "Your mobile number is how you sign in. We verify it with a one-time code so we know the account belongs to you, and it's what you use if you ever need to reset your password.",
        },
        {
          question: "Can I use LavernaEvents on my phone?",
          answer:
            "Yes. Every page is designed for phones first, so you can manage your event, send invitations and check replies from any mobile browser.",
        },
      ],
    },
    {
      id: "invitations",
      title: "Invitations and RSVPs",
      items: [
        {
          question: "How can I send invitations?",
          answer:
            "Pick a template, add your guests, and send over WhatsApp, email or SMS. Plans that include voice calls can also phone your guests. How many invitations you can send depends on your plan, and you can add more with a topup pack.",
        },
        {
          question: "Do my guests need an account to reply?",
          answer:
            "No. Each guest gets a personal link. They open it, see the invitation and answer, and you see the reply straight away.",
        },
        {
          question: "Can I see who has replied?",
          answer:
            "Yes. Your event dashboard shows who is coming, who declined and who hasn't answered yet, so you know exactly who to follow up with.",
        },
      ],
    },
    {
      id: "photos",
      title: "Photos and guest passes",
      items: [
        {
          question: "How do guests get their photos?",
          answer:
            "Your event gets a QR code. Guests scan it to open the event gallery. On plans with face search they can also take a selfie and see only the photos they appear in.",
        },
        {
          question: "Who can upload photos?",
          answer:
            "You can, and so can photographers you invite. Photographers get their own simple upload page and don't see the rest of your account.",
        },
        {
          question: "Who can see my event photos?",
          answer:
            "Your gallery is shared through your event's own QR code and link, so only people you give them to can open it. Face search looks only inside that one event's photos.",
        },
      ],
    },
    {
      id: "billing",
      title: "Plans and billing",
      items: [
        {
          question: "Which plan should I choose?",
          answer:
            "Compare plans on the Pricing page. Each one lists its event, guest, invitation and storage limits, and which features it includes. If you're unsure, start small - you can upgrade whenever your event grows.",
        },
        {
          question: "Can I upgrade later?",
          answer:
            "Yes, any time. When you upgrade to a paid plan, your current plan is replaced once the payment goes through, and any unused topup credits carry over.",
        },
        {
          question: "What if I run out of invitations?",
          answer: "Buy a topup pack from the Billing page in your portal. The extra invitations are added to your account straight away.",
        },
        {
          question: "How do I pay, and is it secure?",
          answer:
            "Payments go through Stripe's secure checkout. Your card details are handled by Stripe and are never stored by LavernaEvents.",
        },
      ],
    },
  ];