import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import {
  GoogleSignin,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import { supabase } from "@/lib/supabase";

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

/** Google is only offered when its client id is configured. */
export const googleConfigured = !!GOOGLE_WEB_CLIENT_ID;

let googleReady = false;
export function configureGoogle() {
  if (!googleConfigured || googleReady) return;
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
  });
  googleReady = true;
}

/** Whether the native Apple button can be shown (iOS + available). */
export function appleAvailable(): boolean {
  return Platform.OS === "ios";
}

/**
 * Native Sign in with Apple -> Supabase. Resolves false on user-cancel (no
 * error to show), throws on a real failure.
 */
export async function signInWithApple(): Promise<boolean> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!credential.identityToken) {
      throw new Error("Apple did not return an identity token.");
    }
    const { error } = await supabase.auth.signInWithIdToken({
      provider: "apple",
      token: credential.identityToken,
    });
    if (error) throw error;
    return true;
  } catch (e) {
    if ((e as { code?: string }).code === "ERR_REQUEST_CANCELED") return false;
    throw e;
  }
}

/**
 * Native Google sign-in -> Supabase. Resolves false on user-cancel, throws on a
 * real failure.
 */
export async function signInWithGoogle(): Promise<boolean> {
  configureGoogle();
  try {
    await GoogleSignin.hasPlayServices();
    // The response shape differs across library versions; read defensively.
    const res = (await GoogleSignin.signIn()) as {
      idToken?: string | null;
      data?: { idToken?: string | null } | null;
    };
    const idToken = res?.data?.idToken ?? res?.idToken;
    if (!idToken) {
      const tokens = await GoogleSignin.getTokens();
      if (!tokens.idToken) throw new Error("Google did not return an ID token.");
      const { error } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: tokens.idToken,
      });
      if (error) throw error;
      return true;
    }
    const { error } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: idToken,
    });
    if (error) throw error;
    return true;
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === statusCodes.SIGN_IN_CANCELLED || code === statusCodes.IN_PROGRESS) {
      return false;
    }
    throw e;
  }
}
