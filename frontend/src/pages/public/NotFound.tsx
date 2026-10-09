import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-[var(--brand-pink)]">
        404
      </p>
      <h1 className="mt-2 text-2xl font-bold text-[var(--brand-navy)] sm:text-3xl">
        Page not found
      </h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        The page you are looking for does not exist or has moved.
      </p>
      <Link to="/" className="mt-6">
        <Button size="lg">Back to home</Button>
      </Link>
    </div>
  );
}