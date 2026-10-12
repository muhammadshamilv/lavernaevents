import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, CheckCircle2, Lock, Phone } from "lucide-react";
import AuthCardLayout from "@/components/auth/AuthCardLayout";
import { AuthNotice, IconField } from "@/components/auth/AuthField";
import { FormError } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Button, buttonVariants } from "@/components/ui/button";
import { loginSchema, type LoginFormValues } from "@/schemas/auth.schema";
import { useLoginMutation } from "@/queries/useAuthQueries";
import { getApiErrorMessage } from "@/lib/apiError";
import { homePathForRole } from "@/lib/roleHome";
import { cn } from "@/lib/utils";

export default function LoginForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as
    | { verified?: boolean; passwordReset?: boolean; from?: { pathname?: string } }
    | null;
  const justVerified = Boolean(locationState?.verified);
  const passwordReset = Boolean(locationState?.passwordReset);
  const fromPath = locationState?.from?.pathname;
  const [searchParams] = useSearchParams();
  const planSlug = searchParams.get("plan");
  const loginMutation = useLoginMutation();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = (values: LoginFormValues) => {
    loginMutation.mutate(values, {
      onSuccess: (user) => {
        const planParam = planSlug ? `&plan=${planSlug}` : "";

        const home = homePathForRole(user.role);

        if (!user.is_verified && user.role !== "ADMIN") {
          navigate(
            `/verify-mobile?mobile=${encodeURIComponent(user.mobile_number)}${planParam}`
          );
        } else if (planSlug && user.role === "ORGANIZER") {
          navigate(`/pricing?plan=${planSlug}`);
        } else if (fromPath && fromPath.startsWith(home) && home !== "/") {
          navigate(fromPath, { replace: true });
        } else {
          navigate(home, { replace: true });
        }
      },
    });
  };

  return (
    <AuthCardLayout
      variant="login"
      flip
      title="Welcome back"
      subtitle="Sign in to manage your events, guests and invitations."
    >
      <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
        {justVerified && (
          <AuthNotice>
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            Mobile verified. You can now sign in.
          </AuthNotice>
        )}

        {passwordReset && (
          <AuthNotice>
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            Password updated. Sign in with your new password.
          </AuthNotice>
        )}

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

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="password">Password</Label>
            <Link
              to="/forgot-password"
              className="text-sm font-semibold text-[var(--brand-pink)] hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <IconField icon={Lock}>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              placeholder="••••••••"
              className="pl-11"
              hasError={!!errors.password}
              {...register("password")}
            />
          </IconField>
          <FormError message={errors.password?.message} />
        </div>

        {loginMutation.isError && (
          <FormError message={getApiErrorMessage(loginMutation.error, "Invalid mobile number or password.")} />
        )}

        <Button
          type="submit"
          className="group w-full shadow-lg shadow-[var(--brand-pink)]/25"
          size="lg"
          isLoading={loginMutation.isPending}
        >
          Sign in
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-slate-400" aria-hidden="true">
        <span className="h-px flex-1 bg-slate-200" />
        New to LavernaEvents?
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <Link
        to={planSlug ? `/register?plan=${planSlug}` : "/register"}
        className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}
      >
        Create an account
      </Link>
    </AuthCardLayout>
  );
}