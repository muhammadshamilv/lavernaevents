import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Phone, ShieldCheck } from "lucide-react";
import AuthCardLayout from "@/components/auth/AuthCardLayout";
import { IconField, ResendCode } from "@/components/auth/AuthField";
import { FormError } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OtpInput } from "@/components/ui/otp-input";
import { verifyMobileSchema, type VerifyMobileFormValues } from "@/schemas/auth.schema";
import { useResendOtpMutation, useVerifyMobileMutation } from "@/queries/useAuthQueries";
import { getApiErrorMessage } from "@/lib/apiError";

// Matches the backend's resend cooldown.
const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Single responsive tree (no hidden/lg:hidden duplicate forms).
 *
 *  - Arriving from registration (?sent=1): the code was already sent, so the
 *    resend timer starts straight away.
 *  - Arriving from a login of an unverified account: no code has been sent
 *    yet, so one is requested automatically (once).
 */
export default function VerifyMobileForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mobileFromQuery = searchParams.get("mobile") ?? "";
  const planSlug = searchParams.get("plan");
  const alreadySent = searchParams.get("sent") === "1";

  const verifyMutation = useVerifyMobileMutation();
  const resendMutation = useResendOtpMutation();
  const [cooldown, setCooldown] = useState(alreadySent ? RESEND_COOLDOWN_SECONDS : 0);
  const [resendNotice, setResendNotice] = useState("");
  const autoSent = useRef(false);

  const {
    control,
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<VerifyMobileFormValues>({
    resolver: zodResolver(verifyMobileSchema),
    defaultValues: { mobile_number: mobileFromQuery, code: "" },
  });

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const sendCode = (mobile: string) => {
    if (!mobile) return;
    resendMutation.mutate(
      { mobile_number: mobile },
      {
        onSuccess: (result) => {
          setCooldown(result.cooldown_seconds ?? RESEND_COOLDOWN_SECONDS);
          setResendNotice("A new code has been sent.");
        },
      }
    );
  };

  useEffect(() => {
    if (alreadySent || !mobileFromQuery || autoSent.current) return;
    autoSent.current = true;
    sendCode(mobileFromQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = (values: VerifyMobileFormValues) => {
    verifyMutation.mutate(values, {
      onSuccess: () => {
        const planParam = planSlug ? `?plan=${planSlug}` : "";
        navigate(`/login${planParam}`, { state: { verified: true } });
      },
    });
  };

  return (
    <AuthCardLayout
      variant="verify"
      icon={<ShieldCheck className="h-7 w-7" />}
      title="Verify your mobile"
      subtitle={
        mobileFromQuery ? (
          <>
            Enter the 6-digit code sent to{" "}
            <span className="font-semibold text-[var(--brand-navy)]">{mobileFromQuery}</span>
          </>
        ) : (
          "Enter your mobile number and the 6-digit code we sent you."
        )
      }
      footer={
        <Link to="/login" className="inline-flex items-center gap-1.5 font-semibold text-[var(--brand-pink)] hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
        </Link>
      }
    >
      <form className="space-y-6" onSubmit={handleSubmit(onSubmit)} noValidate>
        {!mobileFromQuery && (
          <div className="space-y-1.5">
            <Label htmlFor="mobile_number">Mobile number</Label>
            <IconField icon={Phone}>
              <Input
                id="mobile_number"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="9876543210"
                className="pl-11"
                hasError={!!errors.mobile_number}
                {...register("mobile_number")}
              />
            </IconField>
            <FormError message={errors.mobile_number?.message} />
          </div>
        )}

        <Controller
          name="code"
          control={control}
          render={({ field }) => (
            <div className="space-y-2">
              <OtpInput
                value={field.value}
                onChange={field.onChange}
                hasError={!!errors.code}
                autoFocus
              />
              <FormError message={errors.code?.message} />
            </div>
          )}
        />

        {verifyMutation.isError && (
          <FormError
            message={getApiErrorMessage(verifyMutation.error, "Invalid or expired code.")}
          />
        )}

        <Button type="submit" className="w-full shadow-lg shadow-[var(--brand-pink)]/25" size="lg" isLoading={verifyMutation.isPending}>
          Verify mobile
        </Button>
      </form>

      <ResendCode
        cooldown={cooldown}
        pending={resendMutation.isPending}
        onResend={() => sendCode(mobileFromQuery || getValues("mobile_number"))}
        notice={resendNotice}
        error={resendMutation.isError ? getApiErrorMessage(resendMutation.error, "Could not send a new code.") : undefined}
      />
    </AuthCardLayout>
  );
}