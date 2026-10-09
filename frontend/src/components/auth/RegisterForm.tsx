import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { Camera, Sparkles, UserRound } from "lucide-react";
import logo from "@/assets/laverna-logo.png";
import { Card, FormError } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { registerSchema, type RegisterFormValues } from "@/schemas/auth.schema";
import { useRegisterMutation } from "@/queries/useAuthQueries";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/apiError";
import { cn } from "@/lib/utils";

const ROLE_OPTIONS = [
  {
    value: "ORGANIZER" as const,
    label: "Organizer",
    description: "Plan events, manage guests, send invitations",
    icon: UserRound,
  },
  {
    value: "PHOTOGRAPHER" as const,
    label: "Photographer",
    description: "Upload photos & videos to events you're invited to",
    icon: Camera,
  },
];

/**
 * Single responsive register screen. Only ONE form tree is ever mounted
 * (gated by useIsDesktop()), same fix as LoginForm - see that file's
 * comment for why the old hidden/lg:hidden dual-mount pattern was broken.
 */
export default function RegisterForm() {
  const isDesktop = useIsDesktop();
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

  const form = (
    <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="space-y-1.5">
        <Label>I'm signing up as</Label>
        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
          {ROLE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setValue("role", option.value, { shouldValidate: true })}
              className={cn(
                "flex flex-col items-start gap-1.5 rounded-2xl border p-3.5 text-left transition-colors",
                selectedRole === option.value
                  ? "border-[var(--brand-pink)] bg-[var(--brand-pink)]/6"
                  : "border-slate-200 hover:bg-slate-50"
              )}
            >
              <option.icon
                className={cn(
                  "h-5 w-5",
                  selectedRole === option.value ? "text-[var(--brand-pink)]" : "text-slate-400"
                )}
              />
              <span className="text-sm font-semibold text-[var(--brand-navy)]">
                {option.label}
              </span>
              <span className="text-xs text-slate-500">{option.description}</span>
            </button>
          ))}
        </div>
        <FormError message={errors.role?.message} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="full_name">Full name</Label>
        <Input id="full_name" autoComplete="name" placeholder="Jane Doe" hasError={!!errors.full_name} {...register("full_name")} />
        <FormError message={errors.full_name?.message} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="jane@example.com"
          hasError={!!errors.email}
          {...register("email")}
        />
        <FormError message={errors.email?.message} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="mobile_number">Mobile number</Label>
        <Input
          id="mobile_number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="9876543210 or +91 98765 43210"
          hasError={!!errors.mobile_number}
          {...register("mobile_number")}
        />
        <FormError message={errors.mobile_number?.message} />
      </div>

      <div className={isDesktop ? "grid grid-cols-2 gap-4" : "space-y-5"}>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            placeholder="••••••••"
            hasError={!!errors.password}
            {...register("password")}
          />
          <FormError message={errors.password?.message} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password_confirm">Confirm password</Label>
          <PasswordInput
            id="password_confirm"
            autoComplete="new-password"
            placeholder="••••••••"
            hasError={!!errors.password_confirm}
            {...register("password_confirm")}
          />
          <FormError message={errors.password_confirm?.message} />
        </div>
      </div>

      <p className="-mt-2 text-xs text-slate-500">
        Use at least 8 characters, and not only numbers.
      </p>

      {registerMutation.isError && (
        <FormError message={getApiErrorMessage(registerMutation.error, "Registration failed. Please try again.")} />
      )}

      <Button type="submit" className="w-full" size="lg" isLoading={registerMutation.isPending}>
        Create account
      </Button>
    </form>
  );

  if (isDesktop) {
    return (
      <div className="grid min-h-screen grid-cols-2">
        <div
          className="relative flex flex-col justify-between overflow-hidden p-12 text-white"
          style={{ background: "var(--gradient-brand)" }}
        >
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[var(--brand-green)]/10" />
          <div className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-white/10" />

          <Link to="/" className="relative z-10 inline-flex w-fit rounded-2xl bg-white/90 p-2">
            <img src={logo} alt="LavernaEvents" className="h-9 w-auto object-contain" />
          </Link>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="relative z-10 max-w-md"
          >
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium">
              <Sparkles className="h-4 w-4" />
              Join LavernaEvents
            </span>
            <h1 className="mt-6 text-4xl font-bold leading-tight">
              Celebrate beautifully. Connect meaningfully.
            </h1>
            <p className="mt-4 text-white/85">
              Create your account to start planning events, sending invites, and
              managing guests - or, as a photographer, to upload photos and videos
              to the events you're invited to.
            </p>
          </motion.div>

          <p className="relative z-10 text-sm text-white/70">
            © {new Date().getFullYear()} LavernaEvents
          </p>
        </div>

        <div className="flex items-center justify-center overflow-y-auto p-12">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-md"
          >
            <h2 className="text-2xl font-bold text-[var(--brand-navy)]">Create your account</h2>
            <p className="mt-2 text-sm text-slate-500">
              Already have an account?{" "}
              <Link to="/login" className="font-semibold text-[var(--brand-pink)]">
                Sign in
              </Link>
            </p>

            <Card className="mt-8 p-8">{form}</Card>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="gradient-mesh-subtle mobile-safe-bottom min-h-screen px-5 pb-10 pt-8">
      <div className="flex items-center justify-center">
        <img src={logo} alt="LavernaEvents" className="h-10 w-auto object-contain" />
      </div>

      <div className="mt-8 text-center">
        <h1 className="text-2xl font-bold text-[var(--brand-navy)]">Create your account</h1>
        <p className="mt-2 text-sm text-slate-500">
          Start planning events that connect people, beautifully.
        </p>
      </div>

      <div className="mt-8">{form}</div>

      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link to="/login" className="font-semibold text-[var(--brand-pink)]">
          Sign in
        </Link>
      </p>
    </div>
  );
}