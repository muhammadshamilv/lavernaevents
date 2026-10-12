import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import PaymentStatusCard, { PaymentLink } from "@/components/payment/PaymentStatusCard";
import { usePaymentStatusPolling } from "@/queries/usePaymentQueries";

const REDIRECT_DELAY_MS = 2000;

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id") ?? undefined;
  const navigate = useNavigate();

  const { payment, hasTimedOut } = usePaymentStatusPolling(sessionId);

  useEffect(() => {
    if (payment?.status === "PAID") {
      const timer = setTimeout(() => navigate("/portal", { replace: true }), REDIRECT_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [payment?.status, navigate]);

  if (!sessionId) {
    return (
      <PaymentStatusCard
        tone="failed"
        title="Missing payment session"
        message="We couldn't find a payment session to confirm. If you just completed checkout, check your account from the pricing page."
        actions={<PaymentLink to="/pricing" primary>Back to pricing</PaymentLink>}
      />
    );
  }

  if (payment?.status === "PAID") {
    return (
      <PaymentStatusCard
        tone="success"
        title="Payment successful"
        message="Your plan is active. Taking you to your portal..."
        details={[
          { label: "Plan", value: payment.plan_name },
          { label: "Status", value: "Paid" },
        ]}
        redirectMs={REDIRECT_DELAY_MS}
        actions={<PaymentLink to="/portal" primary>Go to my portal now</PaymentLink>}
      />
    );
  }

  if (payment?.status === "FAILED") {
    return (
      <PaymentStatusCard
        tone="failed"
        title="Payment not completed"
        message="The payment was cancelled or didn't go through, so nothing was charged. You can try again whenever you're ready."
        actions={<PaymentLink to="/pricing" primary>Back to pricing</PaymentLink>}
      />
    );
  }

  if (hasTimedOut) {
    return (
      <PaymentStatusCard
        tone="pending"
        title="Still confirming"
        message="We're still confirming your payment, this can take a minute. Refresh this page shortly, or check your account from the portal."
        actions={
          <>
            <Button onClick={() => window.location.reload()}>Refresh</Button>
            <PaymentLink to="/portal">Open my portal</PaymentLink>
          </>
        }
        note="If money was taken and your plan doesn't show up, contact us with the date and amount."
      />
    );
  }

  return (
    <PaymentStatusCard
      tone="loading"
      title="Confirming your payment..."
      message="Hang tight, this only takes a few seconds. Please don't close this page."
    />
  );
}