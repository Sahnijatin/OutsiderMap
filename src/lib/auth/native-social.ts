"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * Native in-app Google + Apple sign-in for the Capacitor app (#151), via
 * `@capgo/capacitor-social-login`. These show the OS-native account sheets (no
 * browser, no WebView OAuth - which Google forbids), return an identity token,
 * and we hand it to Supabase `signInWithIdToken`, so the session lands in the
 * same cookie state the app already uses.
 *
 * Everything is **gated on configuration**: the buttons only appear when the
 * relevant client IDs are present (below), so nothing broken ships before the
 * Google/Apple credentials exist. The plugin itself is dynamically imported so
 * it never enters the web bundle.
 *
 * Config (public env, set on the hosting deployment):
 *   NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID  - Google iOS OAuth client ID
 *   NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID  - Google Web client ID (Android + token audience)
 *   NEXT_PUBLIC_APPLE_SIGN_IN=1       - enable Sign in with Apple (iOS)
 */

const GOOGLE_IOS_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const GOOGLE_WEB_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const APPLE_ENABLED = process.env.NEXT_PUBLIC_APPLE_SIGN_IN === "1";

/** True when Google native client IDs are configured. */
export function isNativeGoogleConfigured(): boolean {
  return Boolean(GOOGLE_IOS_CLIENT_ID || GOOGLE_WEB_CLIENT_ID);
}

/** True when Sign in with Apple is enabled (iOS). */
export function isNativeAppleConfigured(): boolean {
  return APPLE_ENABLED;
}

type SocialLoginApi =
  typeof import("@capgo/capacitor-social-login")["SocialLogin"];

// Initialise the plugin once (with whatever providers are configured).
let initPromise: Promise<SocialLoginApi> | null = null;

async function getSocialLogin(): Promise<SocialLoginApi> {
  if (!initPromise) {
    initPromise = (async () => {
      const { SocialLogin } = await import("@capgo/capacitor-social-login");
      await SocialLogin.initialize({
        ...(isNativeGoogleConfigured()
          ? {
              google: {
                iOSClientId: GOOGLE_IOS_CLIENT_ID,
                iOSServerClientId: GOOGLE_WEB_CLIENT_ID,
                webClientId: GOOGLE_WEB_CLIENT_ID,
              },
            }
          : {}),
        // Empty redirectUrl → native flow on iOS (no web redirect).
        ...(APPLE_ENABLED ? { apple: { redirectUrl: "" } } : {}),
      });
      return SocialLogin;
    })();
  }
  return initPromise;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Google wants the SHA-256 of the nonce; Supabase wants the raw nonce back, so
// it can verify the token's hashed nonce claim matches.
async function makeNonce(): Promise<{ raw: string; hashed: string }> {
  const rand = new Uint8Array(32);
  crypto.getRandomValues(rand);
  const raw = bytesToHex(rand);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw),
  );
  return { raw, hashed: bytesToHex(new Uint8Array(digest)) };
}

/** Native Google sign-in sheet → Supabase session. Throws on failure/cancel. */
export async function nativeGoogleSignIn(): Promise<void> {
  const SocialLogin = await getSocialLogin();
  const { raw, hashed } = await makeNonce();
  const res = await SocialLogin.login({
    provider: "google",
    options: { scopes: ["email", "profile"], nonce: hashed },
  });
  const idToken =
    res.provider === "google" && "idToken" in res.result
      ? res.result.idToken
      : null;
  if (!idToken) throw new Error("Google did not return an identity token.");

  const { error } = await createClient().auth.signInWithIdToken({
    provider: "google",
    token: idToken,
    nonce: raw,
  });
  if (error) throw error;
}

/** Native Apple sign-in sheet → Supabase session. Throws on failure/cancel. */
export async function nativeAppleSignIn(): Promise<void> {
  const SocialLogin = await getSocialLogin();
  const res = await SocialLogin.login({ provider: "apple", options: {} });
  const idToken =
    res.provider === "apple" ? res.result.idToken : null;
  if (!idToken) throw new Error("Apple did not return an identity token.");

  const { error } = await createClient().auth.signInWithIdToken({
    provider: "apple",
    token: idToken,
  });
  if (error) throw error;
}
