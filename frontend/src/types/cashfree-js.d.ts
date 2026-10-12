// The @cashfreepayments/cashfree-js package ships without TypeScript types,
// so the small part of it that LavernaEvents uses is described here.
declare module "@cashfreepayments/cashfree-js" {
    export interface CashfreeCheckoutOptions {
      paymentSessionId: string;
      redirectTarget?: "_self" | "_blank" | "_top" | "_modal";
    }
  
    export interface CashfreeInstance {
      checkout(options: CashfreeCheckoutOptions): Promise<unknown>;
    }
  
    /** Loads Cashfree's checkout script. Resolves to null if it can't be loaded. */
    export function load(options: { mode: "sandbox" | "production" }): Promise<CashfreeInstance | null>;
  }