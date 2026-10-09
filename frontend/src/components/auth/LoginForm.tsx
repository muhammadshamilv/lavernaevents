import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { CheckCircle2, Heart } from "lucide-react";
import logo from "@/assets/laverna-logo.png";
import { Card, FormError } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { loginSchema, type LoginFormValues } from "@/schemas/auth.schema";
import { useLoginMutation } from "@/queries/useAuthQueries";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { getApiErrorMessage } from "@/lib/apiError";
import { homePathForRole } from "@/lib/roleHome";

export default function LoginForm() {
  const isDesktop = useIsDesktop();
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

  const form = (
    <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
      {justVerified && (
        <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Mobile verified. You can now sign in.
        </div>
      )}

      {passwordReset && (
        <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Password updated. Sign in with your new password.
        </div>
      )}

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

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="password">Password</Label>
          <Link
            to="/forgot-password"
            className="text-sm font-semibold text-[var(--brand-pink)]"
          >
            Forgot password?
          </Link>
        </div>
        <PasswordInput
          id="password"
          autoComplete="current-password"
          placeholder="••••••••"
          hasError={!!errors.password}
          {...register("password")}
        />
        <FormError message={errors.password?.message} />
      </div>

      {loginMutation.isError && (
        <FormError message={getApiErrorMessage(loginMutation.error, "Invalid mobile number or password.")} />
      )}

      <Button type="submit" className="w-full" size="lg" isLoading={loginMutation.isPending}>
        Sign in
      </Button>
    </form>
  );

  if (isDesktop) {
    return (
      <div className="grid min-h-screen grid-cols-2">
        <div className="flex items-center justify-center overflow-y-auto p-12">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-md"
          >
            <h2 className="text-2xl font-bold text-[var(--brand-navy)]">Welcome back</h2>
            <p className="mt-2 text-sm text-slate-500">
              New to LavernaEvents?{" "}
              <Link to="/register" className="font-semibold text-[var(--brand-pink)]">
                Create an account
              </Link>
            </p>

            <Card className="mt-8 p-8">{form}</Card>
          </motion.div>
        </div>

        <div
          className="relative flex flex-col justify-between overflow-hidden p-12 text-white"
          style={{ background: "var(--gradient-brand)" }}
        >
          <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[var(--brand-green)]/10" />
          <div className="absolute -bottom-32 -right-16 h-80 w-80 rounded-full bg-white/10" />

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
              <Heart className="h-4 w-4" />
              Good to see you again
            </span>
            <h1 className="mt-6 text-4xl font-bold leading-tight">
              Your events, guests, and invites, all in one portal.
            </h1>
            <p className="mt-4 text-white/85">
              Sign in to pick up right where you left off.
            </p>
          </motion.div>

          <p className="relative z-10 text-sm text-white/70">
            © {new Date().getFullYear()} LavernaEvents
          </p>
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
        <h1 className="text-2xl font-bold text-[var(--brand-navy)]">Welcome back</h1>
        <p className="mt-2 text-sm text-slate-500">Sign in to continue planning</p>
      </div>

      <div className="mt-8">{form}</div>

      <p className="mt-6 text-center text-sm text-slate-500">
        New to LavernaEvents?{" "}
        <Link to="/register" className="font-semibold text-[var(--brand-pink)]">
          Create an account
        </Link>
      </p>
    </div>
  );
}