import { isAxiosError } from "axios";
import type { ApiErrorResponse } from "@/types/api.types";

function firstText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;

  if (Array.isArray(value)) {
    for (const item of value) {
      const text = firstText(item);
      if (text) return text;
    }
    return null;
  }

  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      const text = firstText(item);
      if (text) return text;
    }
  }

  return null;
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError<ApiErrorResponse>(error)) {
    // No response at all = the server could not be reached.
    if (!error.response) {
      return "Cannot reach the server. Check your internet connection and try again.";
    }

    if (error.response.status === 429) {
      return "Too many attempts. Please wait a minute and try again.";
    }

    const payload = error.response.data;

    const fromErrors = firstText(payload?.errors);
    if (fromErrors) return fromErrors;

    if (payload?.message) return payload.message;
  }

  return fallback;
}

export function getApiFieldErrors(error: unknown): Record<string, string> {
  const fieldErrors: Record<string, string> = {};

  if (isAxiosError<ApiErrorResponse>(error)) {
    const errors = error.response?.data?.errors;

    if (errors && typeof errors === "object") {
      for (const [field, messages] of Object.entries(errors)) {
        const text = firstText(messages);
        if (text) fieldErrors[field] = text;
      }
    }
  }

  return fieldErrors;
}