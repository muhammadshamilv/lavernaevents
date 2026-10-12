import { load } from "@cashfreepayments/cashfree-js";

/** What the backend returns when an order is created (CreateCheckoutSessionResponse). */
export interface CashfreeCheckoutInfo {
  order_id: string;
  payment_session_id: string;
  cashfree_mode: "sandbox" | "production";
}

/**
 * Opens Cashfree's hosted checkout in this tab. Cashfree shows the right UPI
 * option for the device: a QR code to scan on a desktop, UPI app buttons on
 * a phone, plus cards and netbanking. When the customer finishes (or
 * abandons) the payment, Cashfree sends the browser back to the return URL
 * the backend gave it (/payment/success?session_id=...), and that page asks
 * the backend for the real result.
 *
 * Rejects when the checkout script cannot load (offline, blocked, ...).
 */
export async function startCashfreeCheckout(info: CashfreeCheckoutInfo): Promise<void> {
  const cashfree = await load({ mode: info.cashfree_mode });

  if (!cashfree) {
    throw new Error("Cashfree checkout could not be loaded.");
  }

  await cashfree.checkout({
    paymentSessionId: info.payment_session_id,
    redirectTarget: "_self",
  });
}

export const CHECKOUT_LOAD_ERROR =
  "Couldn't open the payment page. Check your connection and try again.";