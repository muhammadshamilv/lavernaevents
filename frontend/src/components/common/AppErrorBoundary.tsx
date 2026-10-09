import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

const CHUNK_ERROR = /dynamically imported module|importing a module script failed|loading chunk|chunkloaderror/i;
const RELOAD_KEY = "laverna:chunk-reload";

function shouldAutoReload(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 15_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

// Catches render crashes and, most usefully, "failed to load page" errors
// that happen when a new version is deployed while someone still has the old
// one open (their old chunk file names no longer exist). One automatic
// reload fixes that; if it keeps failing the person sees a clear message
// instead of a blank screen.
export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App error:", error, info.componentStack);
    if (CHUNK_ERROR.test(error.message) && shouldAutoReload()) {
      window.location.reload();
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isChunk = CHUNK_ERROR.test(error.message);

    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
        <h1 className="text-2xl font-semibold text-[var(--brand-navy)]">
          {isChunk ? "A new version is available" : "Something went wrong"}
        </h1>
        <p className="mt-2 max-w-sm text-sm text-slate-500">
          {isChunk
            ? "Reload the page to get the latest version of LavernaEvents."
            : "Reload the page to try again. If it keeps happening, contact us and we'll sort it out."}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-[var(--brand-pink)] px-6 text-sm font-semibold text-white transition-colors hover:bg-[var(--brand-pink-dark)]"
        >
          Reload page
        </button>
      </div>
    );
  }
}