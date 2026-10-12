import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, useReducedMotion } from "framer-motion";
import { Check, MessageSquareHeart, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal, ModalActions } from "@/components/ui/modal";
import { StarRatingInput } from "@/components/ui/star-rating";
import { Textarea } from "@/components/ui/textarea";
import { useSubmitReviewMutation } from "@/queries/useReviewQueries";
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/apiError";

const MESSAGE_MAX = 1000;

const reviewSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(80, "Keep your name under 80 characters"),
  title: z.string().trim().max(80, "Keep this under 80 characters").optional(),
  rating: z.number().int().min(1, "Please choose a rating").max(5),
  message: z
    .string()
    .trim()
    .min(10, "Please write at least a few words")
    .max(MESSAGE_MAX, `Keep your review under ${MESSAGE_MAX} characters`)
    .refine((value) => !/https?:\/\/|www\./i.test(value), "Please leave web links out of your review"),
  website: z.string().optional(),
});

type ReviewFormValues = z.infer<typeof reviewSchema>;

function SuccessView({ onClose }: { onClose: () => void }) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="flex flex-col items-center px-2 py-4 text-center">
      <motion.span
        initial={reduceMotion ? false : { scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 12, stiffness: 220 }}
        className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"
      >
        <Check className="h-10 w-10" strokeWidth={3} />
      </motion.span>
      <h3 className="mt-5 text-xl font-semibold tracking-tight text-[var(--brand-navy)]">Thank you!</h3>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
        We've received your review. It will appear on the site once our team has read it.
      </p>
      <Button className="mt-6 min-w-32" onClick={onClose} data-autofocus>
        Done
      </Button>
    </div>
  );
}

export default function ReviewFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const mutation = useSubmitReviewMutation();

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors },
  } = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { name: "", title: "", rating: 0, message: "", website: "" },
  });

  const messageLength = watch("message")?.length ?? 0;

  const onSubmit = (values: ReviewFormValues) => {
    setFormError(null);

    mutation.mutate(
      {
        name: values.name,
        title: values.title || "",
        rating: values.rating,
        message: values.message,
        website: values.website || "",
      },
      {
        onSuccess: () => setSubmitted(true),
        onError: (error) => {
          for (const [field, message] of Object.entries(getApiFieldErrors(error))) {
            if (field in values) setError(field as keyof ReviewFormValues, { message });
          }
          setFormError(getApiErrorMessage(error, "Couldn't send your review. Please try again."));
        },
      }
    );
  };

  // Start fresh next time, once the closing animation is over.
  const handleExited = () => {
    setSubmitted(false);
    setFormError(null);
    mutation.reset();
    reset();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      onExited={handleExited}
      size="md"
      busy={mutation.isPending}
      icon={submitted ? undefined : MessageSquareHeart}
      tone={submitted ? "success" : "default"}
      title={submitted ? "Review sent" : "Share your experience"}
      description={submitted ? undefined : "Tell others what it was like to use LavernaEvents. It only takes a minute."}
    >
      {submitted ? (
        <SuccessView onClose={onClose} />
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 pt-1">
          <div>
            <Label htmlFor="review-rating">How would you rate us?</Label>
            <div className="mt-1.5">
              <Controller
                name="rating"
                control={control}
                render={({ field }) => (
                  <StarRatingInput id="review-rating" value={field.value} onChange={field.onChange} hasError={!!errors.rating} />
                )}
              />
            </div>
            <FormError message={errors.rating?.message} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="review-name">Your name</Label>
              <Input id="review-name" autoComplete="name" maxLength={80} hasError={!!errors.name} {...register("name")} />
              <FormError message={errors.name?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="review-title">
                You are a... <span className="font-normal text-slate-400">(optional)</span>
              </Label>
              <Input
                id="review-title"
                placeholder="Host, guest, photographer"
                maxLength={80}
                hasError={!!errors.title}
                {...register("title")}
              />
              <FormError message={errors.title?.message} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="review-message">Your review</Label>
            <Textarea
              id="review-message"
              rows={5}
              maxLength={MESSAGE_MAX}
              placeholder="What did you like? What could be better?"
              hasError={!!errors.message}
              {...register("message")}
            />
            <div className="flex items-start justify-between gap-3">
              <FormError message={errors.message?.message} />
              <span className="ml-auto shrink-0 text-xs text-slate-400" aria-hidden="true">
                {messageLength}/{MESSAGE_MAX}
              </span>
            </div>
          </div>

          {/* Spam trap: invisible to people, tempting to bots. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label>
              Website
              <input type="text" tabIndex={-1} autoComplete="off" {...register("website")} />
            </label>
          </div>

          {formError && <FormError message={formError} />}

          <ModalActions className="pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" isLoading={mutation.isPending}>
              <Send className="h-4 w-4" />
              Send review
            </Button>
          </ModalActions>
        </form>
      )}
    </Modal>
  );
}