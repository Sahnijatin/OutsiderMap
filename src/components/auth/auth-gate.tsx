"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { SignInPanel } from "./sign-in-panel";

/**
 * The sign-in wall (#116). Wrap the anonymous-explore surfaces in
 * <AuthGateProvider signedIn={…}>; any client component then calls
 * requireAuth(action) before a walled action. When signed in, the action runs
 * immediately; when not, an inline modal opens and - on email-OTP success -
 * resumes the exact pending action in place (Google is a full-page redirect
 * that returns here via the callback, where the user repeats the tap).
 */

type Prompt = { title: string; subtitle: string };
type PendingAction = () => void | Promise<void>;
type RequireAuth = (action?: PendingAction, prompt?: Partial<Prompt>) => boolean;

const AuthGateContext = createContext<{
  signedIn: boolean;
  requireAuth: RequireAuth;
} | null>(null);

const DEFAULT_PROMPT: Prompt = {
  title: "Sign in to keep going",
  subtitle:
    "Save spots, get answers tuned to your taste, and pick up right where you left off.",
};

export function AuthGateProvider({
  signedIn,
  children,
}: {
  signedIn: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState<Prompt>(DEFAULT_PROMPT);
  const pendingRef = useRef<PendingAction | null>(null);

  const requireAuth = useCallback<RequireAuth>(
    (action, p) => {
      if (signedIn) {
        void action?.();
        return true;
      }
      pendingRef.current = action ?? null;
      setPrompt({ ...DEFAULT_PROMPT, ...p });
      setOpen(true);
      return false;
    },
    [signedIn],
  );

  const close = useCallback(() => {
    setOpen(false);
    pendingRef.current = null;
  }, []);

  const onSignedIn = useCallback(() => {
    setOpen(false);
    const fn = pendingRef.current;
    pendingRef.current = null;
    void fn?.();
  }, []);

  return (
    <AuthGateContext.Provider value={{ signedIn, requireAuth }}>
      {children}
      {open && (
        <SignInModal
          prompt={prompt}
          next={pathname}
          onClose={close}
          onSignedIn={onSignedIn}
        />
      )}
    </AuthGateContext.Provider>
  );
}

/**
 * Access the gate. Outside a provider (e.g. inside the always-signed-in shell)
 * it degrades to running actions directly, so shared components never crash.
 */
export function useAuthGate(): { signedIn: boolean; requireAuth: RequireAuth } {
  const ctx = useContext(AuthGateContext);
  if (!ctx) {
    return {
      signedIn: true,
      requireAuth: (action) => {
        void action?.();
        return true;
      },
    };
  }
  return ctx;
}

function SignInModal({
  prompt,
  next,
  onClose,
  onSignedIn,
}: {
  prompt: Prompt;
  next: string;
  onClose: () => void;
  onSignedIn: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Sign in"
    >
      <button
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-night/70 backdrop-blur-sm"
      />
      <div className="relative z-10 w-full max-w-sm rounded-t-card border border-line bg-surface p-6 shadow-2xl sm:rounded-card">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-full border border-line bg-night/60 p-1.5 text-ink-dim transition-colors hover:text-ink"
        >
          <X className="size-4" />
        </button>
        <p className="voice text-accent">outsider</p>
        <h2 className="mt-1 font-display text-2xl italic">{prompt.title}</h2>
        <p className="mt-1 text-sm text-ink-dim">{prompt.subtitle}</p>
        <div className="mt-5">
          <SignInPanel next={next} onSignedIn={onSignedIn} />
        </div>
      </div>
    </div>
  );
}
