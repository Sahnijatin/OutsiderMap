import { useCallback, useEffect, useState } from "react";
import { View, ScrollView, RefreshControl, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { FeedResult } from "@/lib/types";
import { colors, space } from "@/theme";
import { Text, Eyebrow } from "@/ui/Text";
import { Halo } from "@/ui/Halo";
import { ExperienceCard } from "@/ui/ExperienceCard";

export default function Feed() {
  const { profile } = useSession();
  const [data, setData] = useState<FeedResult | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.feed());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your feed");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const greeting = profile?.display_name ? `, ${profile.display_name.split(" ")[0]}` : "";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Halo style={{ top: -100, left: -40, right: -40, height: 300 }} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        <Eyebrow>Outsidermap · tonight in delhi</Eyebrow>
        <Text variant="title" style={styles.h1}>Where to{greeting}.</Text>

        {!data && !error && (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.accent} />
          </View>
        )}
        {error && <Text variant="small" style={styles.error}>{error}</Text>}

        {data && (
          <>
            <Section title="For you">
              {data.forYou.map((x, i) => (
                <MotiView
                  key={x.id}
                  from={{ opacity: 0, translateY: 16 }}
                  animate={{ opacity: 1, translateY: 0 }}
                  transition={{ type: "timing", duration: 400, delay: i * 60 }}
                >
                  <ExperienceCard experience={x} large={i === 0} />
                </MotiView>
              ))}
              {data.forYou.length === 0 && (
                <Text variant="small" style={styles.empty}>
                  As you save and visit, this fills with the right answers.
                </Text>
              )}
            </Section>

            {data.tonight.length > 0 && (
              <Section title="Happening tonight">
                {data.tonight.map((e) => (
                  <View key={e.id} style={styles.eventRow}>
                    <Text variant="heading" numberOfLines={1}>{e.title}</Text>
                    <Text variant="small">
                      {[e.venue_name, e.area].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                ))}
              </Section>
            )}

            {data.fresh.length > 0 && (
              <Section title="Fresh drops">
                {data.fresh.map((x) => (
                  <ExperienceCard key={x.id} experience={x} />
                ))}
              </Section>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Eyebrow style={styles.sectionTitle}>{title}</Eyebrow>
      <View style={{ gap: space.lg }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.night },
  scroll: { padding: space.xl, paddingBottom: space.xxl },
  h1: { marginTop: space.sm },
  loading: { paddingVertical: space.xxl, alignItems: "center" },
  error: { color: colors.danger, marginTop: space.lg },
  section: { marginTop: space.xxl },
  sectionTitle: { marginBottom: space.lg },
  empty: { paddingVertical: space.lg },
  eventRow: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    padding: space.lg,
    gap: 2,
  },
});
