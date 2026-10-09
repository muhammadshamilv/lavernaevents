import { useEffect, useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, CheckCircle2, UserRound } from "lucide-react";
import { Card, FormError } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  changePasswordSchema,
  profileSchema,
  type ChangePasswordFormValues,
  type ProfileFormValues,
} from "@/schemas/auth.schema";
import {
  useChangePasswordMutation,
  useUpdateProfileMutation,
} from "@/queries/useAuthQueries";
import { useAuthStore } from "@/stores/auth.store";
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/apiError";

const MAX_IMAGE_MB = 5;

function SuccessNote({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
      <CheckCircle2 className="h-4 w-4 shrink-0" />
      {message}
    </div>
  );
}

function ProfileCard() {
  const { user } = useAuthStore();
  const mutation = useUpdateProfileMutation();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [fileError, setFileError] = useState("");
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { full_name: user?.full_name ?? "" },
  });

  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onPickFile = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    setFileError("");
    setSaved(false);

    if (!picked) return;

    if (!["image/jpeg", "image/png"].includes(picked.type)) {
      setFileError("Only JPG and PNG images are allowed.");
      return;
    }
    if (picked.size > MAX_IMAGE_MB * 1024 * 1024) {
      setFileError(`Image must be ${MAX_IMAGE_MB} MB or smaller.`);
      return;
    }
    setFile(picked);
  };

  const onSubmit = (values: ProfileFormValues) => {
    setSaved(false);
    mutation.mutate(
      { full_name: values.full_name, profile_image: file ?? undefined },
      {
        onSuccess: () => {
          setFile(null);
          setSaved(true);
        },
        onError: (error) => {
          const fieldErrors = getApiFieldErrors(error);
          if (fieldErrors.full_name) setError("full_name", { message: fieldErrors.full_name });
          if (fieldErrors.profile_image) setFileError(fieldErrors.profile_image);
        },
      }
    );
  };

  const avatar = preview || user?.profile_image || "";

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-lg font-bold text-[var(--brand-navy)]">Profile</h2>
      <p className="mt-1 text-sm text-slate-500">Your name and photo.</p>

      <form className="mt-6 space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-slate-400">
            {avatar ? (
              <img src={avatar} alt="Profile" className="h-full w-full object-cover" />
            ) : (
              <UserRound className="h-9 w-9" />
            )}
          </div>

          <div className="min-w-0">
            <label
              htmlFor="profile_image"
              className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-[var(--brand-navy)] hover:bg-slate-50"
            >
              <Camera className="h-4 w-4" />
              Change photo
            </label>
            <input
              id="profile_image"
              type="file"
              accept="image/png,image/jpeg"
              className="sr-only"
              onChange={onPickFile}
            />
            <p className="mt-1.5 text-xs text-slate-500">JPG or PNG, up to {MAX_IMAGE_MB} MB.</p>
            <FormError message={fileError} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="full_name">Full name</Label>
          <Input
            id="full_name"
            autoComplete="name"
            hasError={!!errors.full_name}
            {...register("full_name")}
          />
          <FormError message={errors.full_name?.message} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="min-w-0 space-y-1.5">
            <Label>Mobile number</Label>
            <p className="truncate rounded-2xl bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
              {user?.mobile_number}
            </p>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label>Email</Label>
            <p className="truncate rounded-2xl bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
              {user?.email}
            </p>
          </div>
        </div>

        {mutation.isError && (
          <FormError
            message={getApiErrorMessage(mutation.error, "Could not update your profile.")}
          />
        )}
        {saved && <SuccessNote message="Profile updated." />}

        <Button type="submit" className="w-full sm:w-auto" isLoading={mutation.isPending}>
          Save changes
        </Button>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const mutation = useChangePasswordMutation();
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
  });

  const onSubmit = (values: ChangePasswordFormValues) => {
    setSaved(false);
    mutation.mutate(values, {
      onSuccess: () => {
        reset();
        setSaved(true);
      },
      onError: (error) => {
        const fieldErrors = getApiFieldErrors(error);
        for (const field of [
          "current_password",
          "new_password",
          "new_password_confirm",
        ] as const) {
          if (fieldErrors[field]) setError(field, { message: fieldErrors[field] });
        }
      },
    });
  };

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-lg font-bold text-[var(--brand-navy)]">Change password</h2>
      <p className="mt-1 text-sm text-slate-500">
        You'll stay signed in here; other devices will be signed out.
      </p>

      <form className="mt-6 space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="current_password">Current password</Label>
          <PasswordInput
            id="current_password"
            autoComplete="current-password"
            placeholder="••••••••"
            hasError={!!errors.current_password}
            {...register("current_password")}
          />
          <FormError message={errors.current_password?.message} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="new_password">New password</Label>
          <PasswordInput
            id="new_password"
            autoComplete="new-password"
            placeholder="••••••••"
            hasError={!!errors.new_password}
            {...register("new_password")}
          />
          <FormError message={errors.new_password?.message} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="new_password_confirm">Confirm new password</Label>
          <PasswordInput
            id="new_password_confirm"
            autoComplete="new-password"
            placeholder="••••••••"
            hasError={!!errors.new_password_confirm}
            {...register("new_password_confirm")}
          />
          <FormError message={errors.new_password_confirm?.message} />
        </div>

        {mutation.isError && (
          <FormError
            message={getApiErrorMessage(mutation.error, "Could not change the password.")}
          />
        )}
        {saved && <SuccessNote message="Password changed." />}

        <Button type="submit" className="w-full sm:w-auto" isLoading={mutation.isPending}>
          Update password
        </Button>
      </form>
    </Card>
  );
}

export default function AccountSettings() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <h1 className="text-2xl font-bold text-[var(--brand-navy)]">Account settings</h1>
      <p className="mt-1 text-sm text-slate-500">
        Manage your profile and sign-in details.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 lg:items-start">
        <ProfileCard />
        <PasswordCard />
      </div>
    </div>
  );
}