import { useState } from "react";
import { View, ScrollView, StyleSheet, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { MotiView } from "moti";
import { api, streamWhy } from "@/lib/api";
import type { RecommendResult } from "@/lib/types";
import { colors, space } from "@/theme";
import { Text, Eyebrow } from "@/ui/Text";
import { Input } from "@/ui/Input";
import { Button } from "@/ui/Button";
import { ExperienceCard } from "@/ui/ExperienceCard";
import { ConvergenceField } from "@/ui/ConvergenceField";

export default function Chat() {
  const [query, setQuery] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [result, setResult] = useState<RecommendResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    const q = query.trim();
    if (q.length < 2) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    setError(null);
    setResult(null);
    setAsked(q);
    try {
      setResult(await api.askNow(q));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Eyebrow>Right now</Eyebrow>
          <Text variant="title" style={styles.h1}>
            Tell me the mood.
          </Text>
          <Text variant="small" style={styles.sub}>
            "3am, heartbroken, want greasy noodles" · "quiet place to read" · "first date, not boring"
          </Text>

          <View style={styles.inputRow}>
            <Input
              value={query}
              onChangeText={setQuery}
              placeholder="What are you in the mood for?"
              multiline
              style={styles.input}
            />
            <Button label="Ask" onPress={ask} disabled={query.trim().length < 2} />
          </View>

          {loading && (
            <View style={styles.thinking}>
              <ConvergenceField size={180} />
              <Text variant="small" style={styles.thinkingText}>
                Reading the city for you…
              </Text>
            </View>
          )}

          {error && <Text variant="small" style={styles.error}>{error}</Text>}

          {result && (
            <View style={styles.results}>
              {result.picks.length === 0 && (
                <Text variant="body" style={styles.empty}>
                  Nothing fit that cleanly. Try saying it a different way.
                </Text>
              )}
              {result.picks.map((p, i) => (
                <MotiView
                  key={p.place.slug}
                  from={{ opacity: 0, translateY: 16 }}
                  animate={{ opacity: 1, translateY: 0 }}
                  transition={{ type: "timing", duration: 400, delay: i * 120 }}
                  style={{ gap: space.sm }}
                >
                  <ExperienceCard experience={p.place} reason={p.reason} large={i === 0} />
                  {asked && <WhyBlock slug={p.place.slug} query={asked} />}
                </MotiView>
              ))}

              {result.lockedTonightCount > 0 && (
                <View style={styles.locked}>
                  <Text variant="small" style={styles.lockedText}>
                    +{result.lockedTonightCount} underground{" "}
                    {result.lockedTonightCount === 1 ? "thing" : "things"} happening tonight,
                    hidden on the free tier.
                  </Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function WhyBlock({ slug, query }: { slug: string; query: string }) {
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [done, setDone] = useState(false);

  async function run() {
    setStreaming(true);
    setText("");
    try {
      for await (const chunk of streamWhy(slug, query)) {
        setText((t) => t + chunk);
      }
    } catch {
      setText((t) => t || "Couldn't load the why right now.");
    } finally {
      setStreaming(false);
      setDone(true);
    }
  }

  if (!done && !streaming) {
    return (
      <Pressable onPress={run} hitSlop={8} style={styles.whyBtn}>
        <Text variant="small" style={styles.whyBtnText}>Why this, for me →</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.why}>
      <Text variant="body" style={styles.whyText}>
        {text}
        {streaming ? "▋" : ""}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.night },
  flex: { flex: 1 },
  scroll: { padding: space.xl, paddingBottom: space.xxl },
  h1: { marginTop: space.sm },
  sub: { marginTop: space.sm },
  inputRow: { marginTop: space.xl, gap: space.md },
  input: { minHeight: 56, textAlignVertical: "top" },
  thinking: { alignItems: "center", marginTop: space.xxl, gap: space.md },
  thinkingText: {},
  error: { color: colors.danger, marginTop: space.lg },
  results: { marginTop: space.xl, gap: space.xl },
  empty: {},
  whyBtn: { alignSelf: "flex-start", paddingVertical: 4 },
  whyBtnText: { color: colors.accent },
  why: {
    backgroundColor: colors.raise,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
  },
  whyText: { color: colors.ink },
  locked: {
    borderWidth: 1,
    borderColor: "rgba(180,138,237,0.4)",
    backgroundColor: "rgba(180,138,237,0.08)",
    borderRadius: 14,
    padding: space.lg,
  },
  lockedText: { color: colors.under },
});
