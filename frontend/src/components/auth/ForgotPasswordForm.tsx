import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, KeyRound, Mail, Send } from "lucide-react";
import AuthCardLayout from "@/components/auth/AuthCardLayout";
import { IconField } from "@/components/auth/AuthField";
import { FormError } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  forgotPasswordSchema,
  type ForgotPasswordFormValues,
} from "@/schemas/auth.schema";
import { useForgotPasswordMutation } from "@/queries/useAuthQueries";
import { getApiErrorMessage } from "@/lib/apiError";

export default function ForgotPasswordForm() {
  const navigate = useNavigate();
  const mutation = useForgotPasswordMutation();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = (values: ForgotPasswordFormValues) => {
    mutation.mutate(values, {
      onSuccess: () => {
        navigate(
          `/reset-password?identifier=${encodeURIComponent(values.identifier)}&sent=1`
        );
      },
    });
  };

  return (
    <AuthCardLayout
      variant="forgot"
      flip
      icon={<KeyRound className="h-7 w-7" />}
      title="Forgot your password?"
      subtitle="Enter your email or mobile number and we'll send you a 6-digit reset code by SMS and email."
      footer={
        <Link to="/login" className="inline-flex items-center gap-1.5 font-semibold text-[var(--brand-pink)] hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
        </Link>
      }
    >
      <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
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

        {mutation.isError && (
          <FormError
            message={getApiErrorMessage(mutation.error, "Could not send the code. Try again.")}
          />
        )}

        <Button type="submit" className="w-full shadow-lg shadow-[var(--brand-pink)]/25" size="lg" isLoading={mutation.isPending}>
          <Send className="h-4 w-4" />
          Send reset code
        </Button>
      </form>
    </AuthCardLayout>
  );
}