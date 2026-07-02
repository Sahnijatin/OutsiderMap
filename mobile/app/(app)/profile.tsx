import { useCallback, useEffect, useState } from "react";
import { View, ScrollView, StyleSheet, Switch, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { ProfileResult } from "@/lib/types";
import { colors, space, radius } from "@/theme";
import { Text, Eyebrow } from "@/ui/Text";
import { Badge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { Halo } from "@/ui/Halo";

type LearnedSignals = { top_vibes?: { tag: string; score: number }[] };

export default function Profile() {
  const { signOut } = useSession();
  const [data, setData] = useState<ProfileResult | null>(null);
  const [consent, setConsent] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await api.getProfile();
    setData(res);
    setConsent(res.profile?.personalization_enabled ?? true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleConsent(value: boolean) {
    setConsent(value);
    setSaving(true);
    Haptics.selectionAsync();
    try {
      await api.setConsent(value);
    } catch {
      setConsent(!value); // revert on failure
    } finally {
      setSaving(false);
    }
  }

  const vibes = (data?.taste?.learned_signals as LearnedSignals | undefined)?.top_vibes ?? [];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Halo style={{ top: -100, left: -40, right: -40, height: 280 }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Eyebrow>The system's read on you</Eyebrow>
        <Text variant="title" style={styles.h1}>
          {data?.profile?.display_name ?? "Your taste"}
        </Text>

        {!data ? (
          <View style={styles.loading}><ActivityIndicator color={colors.accent} /></View>
        ) : (
          <>
            {data.taste?.taste_summary ? (
              <Text variant="body" style={styles.summary}>{data.taste.taste_summary}</Text>
            ) : (
              <Text variant="small" style={styles.summary}>
                Still reading you - it sharpens as you use the app.
              </Text>
            )}

            {vibes.length > 0 && (
              <View style={styles.vibes}>
                {vibes.slice(0, 8).map((v) => (
                  <Badge key={v.tag} label={v.tag} tone="amber" />
                ))}
              </View>
            )}

            <View style={styles.consent}>
              <View style={styles.consentRow}>
                <View style={styles.consentLabel}>
                  <Text variant="heading">Learn from my activity</Text>
                  <Text variant="small" style={styles.consentSub}>
                    Personalize from what you save, start, and finish. Off keeps
                    recommendations working from your quiz only. Your data is never sold.
                  </Text>
                </View>
                <Switch
                  value={consent}
                  onValueChange={toggleConsent}
                  disabled={saving}
                  trackColor={{ true: colors.accent, false: colors.line }}
                  thumbColor={colors.ink}
                />
              </View>
            </View>

            <View style={styles.signout}>
              <Button label="Sign out" variant="ghost" onPress={signOut} />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.night },
  scroll: { padding: space.xl, paddingBottom: space.xxl },
  h1: { marginTop: space.sm },
  loading: { paddingVertical: space.xxl, alignItems: "center" },
  summary: { marginTop: space.lg },
  vibes: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.xl },
  consent: {
    marginTop: space.xxl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: space.lg,
  },
  consentRow: { flexDirection: "row", alignItems: "flex-start", gap: space.lg },
  consentLabel: { flex: 1 },
  consentSub: { marginTop: space.xs },
  signout: { marginTop: space.xxl },
});
