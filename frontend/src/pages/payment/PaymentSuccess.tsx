import { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
      <div className="gradient-mesh-subtle flex min-h-[70vh] items-center justify-center px-4 py-20">
        <Card className="max-w-md p-8 text-center">
          <XCircle className="mx-auto h-10 w-10 text-rose-500" />
          <h1 className="mt-4 text-xl font-bold text-[var(--brand-navy)]">
            Missing payment session
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            We couldn't find a payment session to confirm. If you just completed checkout,
            check your account from the pricing page.
          </p>
          <Link
            to="/pricing"
            className="mt-6 inline-block text-sm font-semibold text-[var(--brand-pink)]"
          >
            Back to pricing
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="gradient-mesh-subtle flex min-h-[70vh] items-center justify-center px-4 py-20">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Card className="p-8 text-center sm:p-10">
          {payment?.status === "PAID" ? (
            <>
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
              <h1 className="mt-4 text-2xl font-bold text-[var(--brand-navy)]">
                Payment successful
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                You're all set on the {payment.plan_name} plan. Taking you to your portal...
              </p>
            </>
          ) : payment?.status === "FAILED" ? (
            <>
              <XCircle className="mx-auto h-12 w-12 text-rose-500" />
              <h1 className="mt-4 text-2xl font-bold text-[var(--brand-navy)]">
                Payment not completed
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                The payment was cancelled or didn't go through, so nothing was charged. You can try again whenever you're ready.
              </p>
              <Link
                to="/pricing"
                className="mt-6 inline-block text-sm font-semibold text-[var(--brand-pink)]"
              >
                Back to pricing
              </Link>
            </>
          ) : hasTimedOut ? (
            <>
              <Clock className="mx-auto h-12 w-12 text-amber-500" />
              <h1 className="mt-4 text-2xl font-bold text-[var(--brand-navy)]">
                Still confirming
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                We're still confirming your payment, this can take a minute. Refresh this
                page shortly, or check your account from the portal.
              </p>
              <Button className="mt-6" variant="outline" onClick={() => window.location.reload()}>
                Refresh
              </Button>
            </>
          ) : (
            <>
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-[var(--brand-pink)] border-t-transparent" />
              <h1 className="mt-4 text-2xl font-bold text-[var(--brand-navy)]">
                Confirming your payment...
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Hang tight, this only takes a few seconds.
              </p>
              <div className="mt-6 space-y-2">
                <Skeleton className="mx-auto h-3 w-40" />
                <Skeleton className="mx-auto h-3 w-28" />
              </div>
            </>
          )}
        </Card>
      </motion.div>
    </div>
  );
}