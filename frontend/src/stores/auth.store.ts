import { useSyncExternalStore } from "react";
import type { User } from "@/types/auth.types";

interface AuthState {
  user: User | null;
  isChecking: boolean;
}

let state: AuthState = {
  user: null,
  isChecking: true,
};

const listeners = new Set<() => void>();

// The login cookie is httpOnly, so JavaScript cannot tell whether a session
// exists. This tiny hint remembers the last result ("1" logged in, "0" known
// logged out) so a logged-out visitor does not fire /auth/me/ + /auth/refresh/
// on every page load and fill the console with 401s. With no hint yet (first
// visit, cleared storage, blocked storage) we ask the server as before, so an
// existing session is never missed. The server still has the final say.
const HINT_KEY = "laverna.session";

function readHint(): boolean {
  try {
    return window.localStorage.getItem(HINT_KEY) !== "0";
  } catch {
    return true;
  }
}

function writeHint(on: boolean) {
  try {
    window.localStorage.setItem(HINT_KEY, on ? "1" : "0");
  } catch {
    /* storage unavailable - the hint is optional */
  }
}

function emitChange() {
  listeners.forEach((listener) => listener());
}

export const authStore = {
  getState(): AuthState {
    return state;
  },
  setUser(user: User | null) {
    state = { ...state, user };
    writeHint(user !== null);
    emitChange();
  },
  hasSessionHint(): boolean {
    return readHint();
  },
  setChecking(isChecking: boolean) {
    state = { ...state, isChecking };
    emitChange();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useAuthStore(): AuthState {
  return useSyncExternalStore(authStore.subscribe, authStore.getState);
}