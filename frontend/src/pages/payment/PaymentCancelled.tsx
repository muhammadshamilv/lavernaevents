import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export default function PaymentCancelled() {
  const [searchParams] = useSearchParams();
  const isTopup = searchParams.get("type") === "topup";

  return (
    <div className="gradient-mesh-subtle flex min-h-[70vh] items-center justify-center px-4 py-12 sm:py-20">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Card className="p-6 text-center sm:p-10">
          <XCircle className="mx-auto h-12 w-12 text-slate-400" />
          <h1 className="mt-4 text-xl font-bold text-[var(--brand-navy)] sm:text-2xl">
            Payment was cancelled
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {isTopup
              ? "No charge was made. You can buy a topup pack again from Billing whenever you're ready."
              : "No charge was made. You can pick a plan again whenever you're ready."}
          </p>
          <Link
            to={isTopup ? "/portal/billing" : "/pricing"}
            className={buttonVariants({ variant: "primary", className: "mt-6" })}
          >
            {isTopup ? "Back to billing" : "Back to pricing"}
          </Link>
        </Card>
      </motion.div>
    </div>
  );
}