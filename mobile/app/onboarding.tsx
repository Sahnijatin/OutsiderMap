import { useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { MotiView, AnimatePresence } from "moti";
import { QUIZ, type QuizAnswers } from "@/lib/quiz";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { colors, space, fonts, radius } from "@/theme";
import { Text, Eyebrow } from "@/ui/Text";
import { Input } from "@/ui/Input";
import { Button } from "@/ui/Button";
import { ConvergenceField } from "@/ui/ConvergenceField";

export default function Onboarding() {
  const { refreshProfile } = useSession();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = QUIZ[index];
  const isLast = index === QUIZ.length - 1;
  const selectedMulti = (answers[q.id] as string[]) ?? [];

  function next(value: string | string[]) {
    const updated = { ...answers, [q.id]: value };
    setAnswers(updated);
    setDraft("");
    if (isLast) submit(updated);
    else setIndex((i) => i + 1);
  }

  function pickSingle(value: string) {
    Haptics.selectionAsync();
    next(value);
  }

  function toggleMulti(value: string) {
    Haptics.selectionAsync();
    setAnswers((a) => {
      const cur = (a[q.id] as string[]) ?? [];
      const has = cur.includes(value);
      return { ...a, [q.id]: has ? cur.filter((v) => v !== value) : [...cur, value] };
    });
  }

  async function submit(final: QuizAnswers) {
    setSubmitting(true);
    setError(null);
    try {
      await api.submitOnboarding(final);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refreshProfile(); // routes onward via the gate
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  if (submitting) {
    return (
      <View style={styles.submitting}>
        <ConvergenceField size={220} />
        <Text variant="heading" style={styles.submittingText}>
          Reading your taste…
        </Text>
        {error && <Text variant="small" style={styles.error}>{error}</Text>}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Progress */}
      <View style={styles.progress}>
        {QUIZ.map((_, i) => (
          <View key={i} style={[styles.seg, i <= index && styles.segOn]} />
        ))}
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <AnimatePresence exitBeforeEnter>
            <MotiView
              key={q.id}
              from={{ opacity: 0, translateX: 24 }}
              animate={{ opacity: 1, translateX: 0 }}
              exit={{ opacity: 0, translateX: -24 }}
              transition={{ type: "timing", duration: 350 }}
            >
              <Eyebrow>{q.eyebrow}</Eyebrow>
              <Text variant="title" style={styles.title}>{q.title}</Text>
              {q.hint && <Text variant="small" style={styles.hint}>{q.hint}</Text>}

              <View style={styles.options}>
                {q.kind === "single" &&
                  q.options?.map((o) => (
                    <Pressable key={o.value} style={styles.option} onPress={() => pickSingle(o.value)}>
                      <Text style={styles.optLabel}>{o.label}</Text>
                      {o.detail && <Text variant="small" style={styles.optDetail}>{o.detail}</Text>}
                    </Pressable>
                  ))}

                {q.kind === "multi" && (
                  <>
                    {q.options?.map((o) => {
                      const on = selectedMulti.includes(o.value);
                      return (
                        <Pressable
                          key={o.value}
                          style={[styles.option, on && styles.optionOn]}
                          onPress={() => toggleMulti(o.value)}
                        >
                          <Text style={[styles.optLabel, on && { color: colors.accent }]}>{o.label}</Text>
                        </Pressable>
                      );
                    })}
                    <View style={styles.cta}>
                      <Button
                        label="Continue"
                        disabled={selectedMulti.length === 0}
                        onPress={() => next(selectedMulti)}
                      />
                    </View>
                  </>
                )}

                {q.kind === "text" && (
                  <>
                    <Input
                      value={draft}
                      onChangeText={setDraft}
                      placeholder="Type it in your own words…"
                      multiline
                      style={styles.textArea}
                    />
                    <View style={styles.cta}>
                      <Button
                        label={isLast ? "Finish" : "Continue"}
                        disabled={draft.trim().length < 10}
                        onPress={() => next(draft.trim())}
                      />
                    </View>
                  </>
                )}
              </View>
            </MotiView>
          </AnimatePresence>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.night },
  flex: { flex: 1 },
  progress: { flexDirection: "row", gap: 4, paddingHorizontal: space.xl, paddingTop: space.sm },
  seg: { flex: 1, height: 2.5, borderRadius: 2, backgroundColor: colors.line },
  segOn: { backgroundColor: colors.accent },
  scroll: { padding: space.xl, paddingTop: space.xxl, flexGrow: 1 },
  title: { marginTop: space.md },
  hint: { marginTop: space.sm, maxWidth: 320 },
  options: { marginTop: space.xl, gap: space.md },
  option: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    paddingVertical: space.lg,
    paddingHorizontal: space.lg,
  },
  optionOn: { borderColor: colors.accent, backgroundColor: "rgba(240,164,49,0.06)" },
  optLabel: { fontFamily: fonts.bodyMedium, fontSize: 17, color: colors.ink },
  optDetail: { marginTop: 2 },
  textArea: { minHeight: 120, textAlignVertical: "top" },
  cta: { marginTop: space.md },
  submitting: { flex: 1, backgroundColor: colors.night, alignItems: "center", justifyContent: "center", gap: space.lg },
  submittingText: { marginTop: space.lg },
  error: { color: colors.danger },
});
