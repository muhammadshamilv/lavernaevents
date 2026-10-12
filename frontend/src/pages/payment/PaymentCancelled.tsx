import { useSearchParams } from "react-router-dom";
import PaymentStatusCard, { PaymentLink } from "@/components/payment/PaymentStatusCard";

export default function PaymentCancelled() {
  const [searchParams] = useSearchParams();
  const isTopup = searchParams.get("type") === "topup";

  return (
    <PaymentStatusCard
      tone="cancelled"
      title="Payment was cancelled"
      message={
        isTopup
          ? "No charge was made. You can buy a topup pack again from Billing whenever you're ready."
          : "No charge was made. You can pick a plan again whenever you're ready."
      }
      actions={
        <>
          <PaymentLink to={isTopup ? "/portal/billing" : "/pricing"} primary>
            {isTopup ? "Back to billing" : "Back to pricing"}
          </PaymentLink>
          <PaymentLink to="/contact">Need help?</PaymentLink>
        </>
      }
    />
  );
}