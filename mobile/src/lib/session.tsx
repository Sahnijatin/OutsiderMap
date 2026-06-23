import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import type { ProfileResult } from "@/lib/types";

type SessionState = {
  loading: boolean;
  /** True once the first profile fetch for the current session has settled. */
  profileReady: boolean;
  session: Session | null;
  profile: ProfileResult["profile"] | null;
  onboarded: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionState | undefined>(undefined);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [profileReady, setProfileReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileResult["profile"] | null>(null);

  const refreshProfile = useCallback(async () => {
    try {
      const { profile } = await api.getProfile();
      setProfile(profile);
    } catch {
      setProfile(null);
    } finally {
      setProfileReady(true);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Whenever we have a session, (re)load the profile to know onboarding state.
  useEffect(() => {
    if (session) {
      setProfileReady(false);
      refreshProfile();
    } else {
      setProfile(null);
      setProfileReady(false);
    }
  }, [session, refreshProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <SessionContext.Provider
      value={{
        loading,
        profileReady,
        session,
        profile,
        onboarded: !!profile?.onboarding_completed_at,
        refreshProfile,
        signOut,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
