import { useCallback, useState } from "react";
import { View, ScrollView, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { api } from "@/lib/api";
import type { BucketItem, BucketStatus } from "@/lib/types";
import { colors, space, radius, fonts } from "@/theme";
import { Text, Eyebrow } from "@/ui/Text";
import { ExperienceCard } from "@/ui/ExperienceCard";

const FILTERS: { key: "all" | BucketStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "saved", label: "Saved" },
  { key: "started", label: "Started" },
  { key: "completed", label: "Done" },
];

export default function Bucket() {
  const [rows, setRows] = useState<BucketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | BucketStatus>("all");

  const load = useCallback(async () => {
    try {
      const { items } = await api.bucket();
      setRows(items);
    } catch {
      // keep whatever was on screen; pull-to-focus retries
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const visible = rows.filter((r) => filter === "all" || r.status === filter);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Eyebrow>Your bucket</Eyebrow>
        <Text variant="title" style={styles.h1}>Saved & done.</Text>

        <View style={styles.filters}>
          {FILTERS.map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.chip, filter === f.key && styles.chipOn]}
            >
              <Text style={[styles.chipText, filter === f.key && styles.chipTextOn]}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : visible.length === 0 ? (
          <Text variant="small" style={styles.empty}>
            Nothing here yet. Add experiences to your bucket from the feed or Right Now.
          </Text>
        ) : (
          <View style={styles.list}>
            {visible.map((r) => (
              <ExperienceCard key={r.place.id} experience={r.place} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.night },
  scroll: { padding: space.xl, paddingBottom: space.xxl },
  h1: { marginTop: space.sm },
  filters: { flexDirection: "row", gap: space.sm, marginTop: space.xl },
  chip: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: "rgba(240,164,49,0.08)" },
  chipText: { fontFamily: fonts.mono, fontSize: 12, color: colors.inkDim },
  chipTextOn: { color: colors.accent },
  loading: { paddingVertical: space.xxl, alignItems: "center" },
  empty: { marginTop: space.xxl },
  list: { marginTop: space.xl, gap: space.lg },
});
