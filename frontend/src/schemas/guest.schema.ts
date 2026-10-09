import { z } from "zod";
import { normalizeGuestMobile } from "@/lib/phone";

export const guestSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Guest name is required.")
    .max(150, "Name must be 150 characters or fewer."),
  // Accepts "+91 98765 43210", "98765-43210", "09876543210" ... and turns it
  // into the stored form (see lib/phone.ts), then checks 10-15 digits.
  mobile_number: z
    .string()
    .trim()
    .min(1, "Mobile number is required.")
    .transform(normalizeGuestMobile)
    .pipe(z.string().regex(/^\d{10,15}$/, "Enter a valid mobile number (10-15 digits).")),
  email: z
    .union([z.string().trim().toLowerCase().email("Enter a valid email address."), z.literal("")])
    .optional(),
  // Hard boundary matches the backend (0-50, same message).
  family_member_count: z.coerce
    .number()
    .int("Enter a whole number.")
    .min(0, "Can't be negative.")
    .max(50, "Family member count seems unusually high. Please double check.")
    .optional(),
  notes: z.string().trim().max(255, "Notes must be 255 characters or fewer.").optional(),
});

// z.coerce / transform make the schema's INPUT type differ from its OUTPUT
// type. useForm<GuestFormInput, unknown, GuestFormValues> needs both.
export type GuestFormValues = z.infer<typeof guestSchema>;
export type GuestFormInput = z.input<typeof guestSchema>;
