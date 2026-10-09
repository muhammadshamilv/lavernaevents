import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound } from "lucide-react";
import AuthCardLayout from "@/components/auth/AuthCardLayout";
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
      icon={<KeyRound className="h-7 w-7" />}
      title="Forgot your password?"
      subtitle="Enter your email or mobile number and we'll send you a 6-digit reset code by SMS and email."
      footer={
        <>
          Remembered it?{" "}
          <Link to="/login" className="font-semibold text-[var(--brand-pink)]">
            Back to sign in
          </Link>
        </>
      }
    >
      <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="identifier">Email or mobile number</Label>
          <Input
            id="identifier"
            autoComplete="username"
            autoCapitalize="none"
            placeholder="you@example.com or 9876543210"
            hasError={!!errors.identifier}
            {...register("identifier")}
          />
          <FormError message={errors.identifier?.message} />
        </div>

        {mutation.isError && (
          <FormError
            message={getApiErrorMessage(mutation.error, "Could not send the code. Try again.")}
          />
        )}

        <Button type="submit" className="w-full" size="lg" isLoading={mutation.isPending}>
          Send reset code
        </Button>
      </form>
    </AuthCardLayout>
  );
}