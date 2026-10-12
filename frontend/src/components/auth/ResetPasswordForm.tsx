import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Lock, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import AuthCardLayout from "@/components/auth/AuthCardLayout";
import { IconField, PasswordStrength, ResendCode } from "@/components/auth/AuthField";
import { FormError } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { OtpInput } from "@/components/ui/otp-input";
import {
  resetPasswordSchema,
  type ResetPasswordFormValues,
} from "@/schemas/auth.schema";
import {
  useForgotPasswordMutation,
  useResetPasswordMutation,
} from "@/queries/useAuthQueries";
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/apiError";

// Matches the backend's resend cooldown.
const RESEND_COOLDOWN_SECONDS = 60;

export default function ResetPasswordForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const identifierFromQuery = searchParams.get("identifier") ?? "";
  const alreadySent = searchParams.get("sent") === "1";

  const resetMutation = useResetPasswordMutation();
  const resendMutation = useForgotPasswordMutation();
  const [cooldown, setCooldown] = useState(alreadySent ? RESEND_COOLDOWN_SECONDS : 0);
  const [resendNotice, setResendNotice] = useState("");

  const {
    control,
    register,
    handleSubmit,
    setError,
    getValues,
    watch,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      identifier: identifierFromQuery,
      code: "",
      new_password: "",
      new_password_confirm: "",
    },
  });

  const newPassword = watch("new_password") ?? "";

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const onSubmit = (values: ResetPasswordFormValues) => {
    resetMutation.mutate(values, {
      onSuccess: () => {
        navigate("/login", { replace: true, state: { passwordReset: true } });
      },
      onError: (error) => {
        const fieldErrors = getApiFieldErrors(error);
        for (const field of ["new_password", "new_password_confirm"] as const) {
          if (fieldErrors[field]) setError(field, { message: fieldErrors[field] });
        }
      },
    });
  };

  const handleResend = () => {
    const identifier = identifierFromQuery || getValues("identifier");
    if (cooldown > 0 || !identifier) return;

    resendMutation.mutate(
      { identifier },
      {
        onSuccess: (result) => {
          setCooldown(result.cooldown_seconds ?? RESEND_COOLDOWN_SECONDS);
          setResendNotice("A new code has been sent.");
        },
      }
    );
  };

  return (
    <AuthCardLayout
      variant="reset"
      flip
      icon={<LockKeyhole className="h-7 w-7" />}
      title="Set a new password"
      subtitle={
        identifierFromQuery ? (
          <>
            Enter the 6-digit code sent to{" "}
            <span className="font-semibold text-[var(--brand-navy)]">
              {identifierFromQuery}
            </span>
            , then choose a new password.
          </>
        ) : (
          "Enter your email or mobile number, the 6-digit code, and your new password."
        )
      }
      footer={
        <Link to="/login" className="inline-flex items-center gap-1.5 font-semibold text-[var(--brand-pink)] hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
        </Link>
      }
    >
      <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
        {!identifierFromQuery && (
          <div className="space-y-1.5">
            <Label htmlFor="identifier">Email or mobile number</Label>
            <IconField icon={Mail}>
              <Input
                id="identifier"
                autoComplete="username"
                autoCapitalize="none"
                placeholder="you@example.com or 9876543210"
                className="pl-11"
                hasError={!!errors.identifier}
                {...register("identifier")}
              />
            </IconField>
            <FormError message={errors.identifier?.message} />
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

        <div className="space-y-1.5">
          <Label htmlFor="new_password">New password</Label>
          <IconField icon={Lock}>
            <PasswordInput
              id="new_password"
              autoComplete="new-password"
              placeholder="••••••••"
              className="pl-11"
              hasError={!!errors.new_password}
              {...register("new_password")}
            />
          </IconField>
          <FormError message={errors.new_password?.message} />
          <div className="space-y-2 pt-0.5">
            <PasswordStrength value={newPassword} />
            <p className="text-xs text-slate-500">Use at least 8 characters, and not only numbers.</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="new_password_confirm">Confirm new password</Label>
          <IconField icon={ShieldCheck}>
            <PasswordInput
              id="new_password_confirm"
              autoComplete="new-password"
              placeholder="••••••••"
              className="pl-11"
              hasError={!!errors.new_password_confirm}
              {...register("new_password_confirm")}
            />
          </IconField>
          <FormError message={errors.new_password_confirm?.message} />
        </div>

        {resetMutation.isError && (
          <FormError
            message={getApiErrorMessage(
              resetMutation.error,
              "Could not reset the password. Check the code and try again."
            )}
          />
        )}

        <Button type="submit" className="w-full shadow-lg shadow-[var(--brand-pink)]/25" size="lg" isLoading={resetMutation.isPending}>
          Reset password
        </Button>
      </form>

      <ResendCode
        cooldown={cooldown}
        pending={resendMutation.isPending}
        onResend={handleResend}
        notice={resendNotice}
        error={resendMutation.isError ? getApiErrorMessage(resendMutation.error, "Could not send a new code.") : undefined}
      />
    </AuthCardLayout>
  );
}