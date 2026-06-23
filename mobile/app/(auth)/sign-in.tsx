import { useState } from "react";
import { View, StyleSheet, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import * as AppleAuthentication from "expo-apple-authentication";
import { MotiView } from "moti";
import { supabase } from "@/lib/supabase";
import {
  appleAvailable,
  googleConfigured,
  signInWithApple,
  signInWithGoogle,
} from "@/lib/oauth";
import { colors, space } from "@/theme";
import { Text, Eyebrow } from "@/ui/Text";
import { Input } from "@/ui/Input";
import { Button } from "@/ui/Button";
import { Halo } from "@/ui/Halo";

const APPLY_URL = `${process.env.EXPO_PUBLIC_API_URL ?? ""}/join`;

export default function SignIn() {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: false }, // invite-only: no self-signup
    });
    setLoading(false);
    if (error) setError(error.message);
    else setStep("code");
  }

  async function verify() {
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: "email",
    });
    setLoading(false);
    if (error) setError(error.message);
    // On success, the session listener in SessionProvider routes onward.
  }

  async function social(fn: () => Promise<boolean>) {
    setError(null);
    setLoading(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Halo style={{ top: -120, left: -60, right: -60, height: 360 }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <View style={styles.body}>
          <MotiView
            from={{ opacity: 0, translateY: 12 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 600 }}
          >
            <Eyebrow>Outsidermap · members only</Eyebrow>
            <Text variant="hero" style={styles.title}>
              Your city,{"\n"}your taste.
            </Text>
            <Text variant="small" style={styles.sub}>
              {step === "email"
                ? "Sign in with the email you were approved with."
                : `Enter the 6-digit code sent to ${email}.`}
            </Text>
          </MotiView>

          <View style={styles.form}>
            {step === "email" ? (
              <Input
                value={email}
                onChangeText={setEmail}
                placeholder="you@email.com"
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                inputMode="email"
              />
            ) : (
              <Input
                value={code}
                onChangeText={setCode}
                placeholder="123456"
                keyboardType="number-pad"
                maxLength={6}
              />
            )}

            {error && (
              <Text variant="small" style={styles.error}>
                {error}
              </Text>
            )}

            <Button
              label={step === "email" ? "Send code" : "Enter"}
              loading={loading}
              disabled={step === "email" ? email.length < 4 : code.length < 6}
              onPress={step === "email" ? sendCode : verify}
            />

            {step === "code" && (
              <Pressable onPress={() => setStep("email")} hitSlop={12}>
                <Text variant="small" style={styles.link}>
                  Use a different email
                </Text>
              </Pressable>
            )}

            {step === "email" && (appleAvailable() || googleConfigured) && (
              <View style={styles.social}>
                <View style={styles.divider}>
                  <View style={styles.rule} />
                  <Text variant="small" style={styles.or}>or</Text>
                  <View style={styles.rule} />
                </View>

                {appleAvailable() && (
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                    cornerRadius={999}
                    style={styles.appleBtn}
                    onPress={() => social(signInWithApple)}
                  />
                )}

                {googleConfigured && (
                  <Button
                    label="Continue with Google"
                    variant="ghost"
                    onPress={() => social(signInWithGoogle)}
                  />
                )}
              </View>
            )}
          </View>
        </View>

        <Pressable
          style={styles.apply}
          onPress={() => WebBrowser.openBrowserAsync(APPLY_URL)}
          hitSlop={12}
        >
          <Text variant="small" style={styles.applyText}>
            Not a member yet? <Text style={styles.applyEm}>Apply to join →</Text>
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.night },
  flex: { flex: 1 },
  body: { flex: 1, justifyContent: "center", paddingHorizontal: space.xl },
  title: { marginTop: space.md },
  sub: { marginTop: space.md, maxWidth: 300 },
  form: { marginTop: space.xxl, gap: space.lg },
  error: { color: colors.danger },
  link: { textAlign: "center", color: colors.inkDim },
  social: { marginTop: space.sm, gap: space.md },
  divider: { flexDirection: "row", alignItems: "center", gap: space.md, marginVertical: space.sm },
  rule: { flex: 1, height: 1, backgroundColor: colors.line },
  or: { color: colors.inkDim },
  appleBtn: { height: 52, width: "100%" },
  apply: { padding: space.xl, alignItems: "center" },
  applyText: { color: colors.inkDim },
  applyEm: { color: colors.accent },
});
