import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Camera, Check, Lock, Mail, Phone, ShieldCheck, User, UserRound } from "lucide-react";
import AuthCardLayout from "@/components/auth/AuthCardLayout";
import { IconField, PasswordStrength } from "@/components/auth/AuthField";
import { FormError } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Button, buttonVariants } from "@/components/ui/button";
import { registerSchema, type RegisterFormValues } from "@/schemas/auth.schema";
import { useRegisterMutation } from "@/queries/useAuthQueries";
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/apiError";
import { cn } from "@/lib/utils";

const ROLE_OPTIONS = [
  {
    value: "ORGANIZER" as const,
    label: "Organizer",
    description: "Plan events, manage guests and send invitations",
    icon: UserRound,
  },
  {
    value: "PHOTOGRAPHER" as const,
    label: "Photographer",
    description: "Upload photos and videos to events you're invited to",
    icon: Camera,
  },
];

export default function RegisterForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const planSlug = searchParams.get("plan");
  const registerMutation = useRegisterMutation();

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { role: "ORGANIZER" },
  });

  const selectedRole = watch("role");
  const passwordValue = watch("password") ?? "";

  const onSubmit = (values: RegisterFormValues) => {
    registerMutation.mutate(values, {
      onSuccess: (user) => {
        // Photographers skip the plan/pricing funnel entirely (that's an
        // organizer-only concept), so the ?plan= param - meaningful only
        // for an organizer who arrived from the pricing page - is never
        // forwarded for a photographer signup.
        const planParam = values.role === "ORGANIZER" && planSlug ? `&plan=${planSlug}` : "";
        navigate(
          `/verify-mobile?mobile=${encodeURIComponent(user.mobile_number)}&sent=1${planParam}`
        );
      },
      onError: (error) => {
        const fieldErrors = getApiFieldErrors(error);
        for (const [field, message] of Object.entries(fieldErrors)) {
          if (field in values) {
            setError(field as keyof RegisterFormValues, { message });
          }
        }
      },
    });
  };

  return (
    <AuthCardLayout
      variant="register"
      wide
      title="Create your account"
      subtitle="It takes about a minute. We'll text you a code to confirm your number."
    >
      <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
        <fieldset className="space-y-1.5">
          <legend className="mb-1.5 text-sm font-medium text-[var(--brand-navy)]">I&apos;m signing up as</legend>
          <div role="radiogroup" aria-label="Account type" className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
            {ROLE_OPTIONS.map((option) => {
              const selected = selectedRole === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setValue("role", option.value, { shouldValidate: true })}
                  className={cn(
                    "relative flex flex-col items-start gap-2 rounded-2xl border-2 p-4 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-pink)]/40",
                    selected
                      ? "border-[var(--brand-pink)] bg-[var(--brand-pink)]/[0.05] shadow-sm shadow-[var(--brand-pink)]/10"
                      : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-xl transition-colors",
                      selected ? "bg-[var(--brand-pink)] text-white" : "bg-slate-100 text-slate-500"
                    )}
                  >
                    <option.icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="text-sm font-semibold text-[var(--brand-navy)]">{option.label}</span>
                  <span className="text-xs leading-snug text-slate-500">{option.description}</span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--brand-pink)] text-white transition-all duration-200",
                      selected ? "scale-100 opacity-100" : "scale-50 opacity-0"
                    )}
                  >
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                </button>
              );
            })}
          </div>
          <FormError message={errors.role?.message} />
        </fieldset>

        <div className="space-y-1.5">
          <Label htmlFor="full_name">Full name</Label>
          <IconField icon={User}>
            <Input id="full_name" autoComplete="name" placeholder="Jane Doe" className="pl-11" hasError={!!errors.full_name} {...register("full_name")} />
          </IconField>
          <FormError message={errors.full_name?.message} />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="email">Email address</Label>
            <IconField icon={Mail}>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="jane@example.com"
                className="pl-11"
                hasError={!!errors.email}
                {...register("email")}
              />
            </IconField>
            <FormError message={errors.email?.message} />
          </div>

          <div className="min-w-0 space-y-1.5">
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
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <IconField icon={Lock}>
              <PasswordInput
                id="password"
                autoComplete="new-password"
                placeholder="••••••••"
                className="pl-11"
                hasError={!!errors.password}
                {...register("password")}
              />
            </IconField>
            <FormError message={errors.password?.message} />
          </div>

          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="password_confirm">Confirm password</Label>
            <IconField icon={ShieldCheck}>
              <PasswordInput
                id="password_confirm"
                autoComplete="new-password"
                placeholder="••••••••"
                className="pl-11"
                hasError={!!errors.password_confirm}
                {...register("password_confirm")}
              />
            </IconField>
            <FormError message={errors.password_confirm?.message} />
          </div>
        </div>

        <div className="space-y-2">
          <PasswordStrength value={passwordValue} />
          <p className="text-xs text-slate-500">Use at least 8 characters, and not only numbers.</p>
        </div>

        {registerMutation.isError && (
          <FormError message={getApiErrorMessage(registerMutation.error, "Registration failed. Please try again.")} />
        )}

        <Button
          type="submit"
          className="group w-full shadow-lg shadow-[var(--brand-pink)]/25"
          size="lg"
          isLoading={registerMutation.isPending}
        >
          Create account
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Button>

        <p className="text-center text-xs leading-relaxed text-slate-500">
          By creating an account you agree to our{" "}
          <Link to="/terms" className="font-semibold text-[var(--brand-navy)] hover:text-[var(--brand-pink)]">Terms</Link>{" "}
          and{" "}
          <Link to="/privacy" className="font-semibold text-[var(--brand-navy)] hover:text-[var(--brand-pink)]">Privacy Policy</Link>.
        </p>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-slate-400" aria-hidden="true">
        <span className="h-px flex-1 bg-slate-200" />
        Already have an account?
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <Link to="/login" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}>
        Sign in
      </Link>
    </AuthCardLayout>
  );
}