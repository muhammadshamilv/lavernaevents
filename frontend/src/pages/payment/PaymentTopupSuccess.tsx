import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import PaymentStatusCard, { PaymentLink } from "@/components/payment/PaymentStatusCard";
import { useTopupPurchaseStatusPolling } from "@/queries/usePaymentQueries";

const REDIRECT_DELAY_MS = 2000;

export default function PaymentTopupSuccess() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id") ?? undefined;
  const navigate = useNavigate();

  const { purchase, hasTimedOut } = useTopupPurchaseStatusPolling(sessionId);

  useEffect(() => {
    if (purchase?.status === "PAID") {
      const timer = setTimeout(() => navigate("/portal/billing", { replace: true }), REDIRECT_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [purchase?.status, navigate]);

  if (!sessionId) {
    return (
      <PaymentStatusCard
        tone="failed"
        title="Missing payment session"
        message="We couldn't find a payment session to confirm. If you just completed checkout, check your billing page."
        actions={<PaymentLink to="/portal/billing" primary>Back to billing</PaymentLink>}
      />
    );
  }

  if (purchase?.status === "PAID") {
    const unit = purchase.pack_kind === "VOICE_CALLS" ? "voice calls" : "invitations";

    return (
      <PaymentStatusCard
        tone="success"
        title="Topup successful"
        message="The credits are on your account. Taking you to your billing page..."
        details={[
          { label: "Pack", value: purchase.pack_name },
          { label: "Added", value: `+${purchase.pack_quantity.toLocaleString()} ${unit}` },
          { label: "Status", value: "Paid" },
        ]}
        redirectMs={REDIRECT_DELAY_MS}
        actions={<PaymentLink to="/portal/billing" primary>Go to billing now</PaymentLink>}
      />
    );
  }

  if (purchase?.status === "FAILED") {
    return (
      <PaymentStatusCard
        tone="failed"
        title="Payment not completed"
        message="The payment was cancelled or didn't go through, so nothing was charged. You can try again whenever you're ready."
        actions={<PaymentLink to="/portal/billing" primary>Back to billing</PaymentLink>}
      />
    );
  }

  if (hasTimedOut) {
    return (
      <PaymentStatusCard
        tone="pending"
        title="Still confirming"
        message="We're still confirming your payment, this can take a minute. Refresh this page shortly, or check your billing page."
        actions={
          <>
            <Button onClick={() => window.location.reload()}>Refresh</Button>
            <PaymentLink to="/portal/billing">Open billing</PaymentLink>
          </>
        }
        note="If money was taken and the credits don't show up, contact us with the date and amount."
      />
    );
  }

  return (
    <PaymentStatusCard
      tone="loading"
      title="Confirming your topup..."
      message="Hang tight, this only takes a few seconds. Please don't close this page."
    />
  );
}