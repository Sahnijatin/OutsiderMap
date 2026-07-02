import { useCallback, useEffect, useState } from "react";
import {
  View,
  ScrollView,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { Experience, FeedResult, PlaceKind } from "@/lib/types";
import { colors, space } from "@/theme";
import { Text, Eyebrow } from "@/ui/Text";
import { Halo } from "@/ui/Halo";
import { ExperienceCard } from "@/ui/ExperienceCard";

// Filter chips. `null` is "All" (the curated feed); a kind switches to a flat,
// filtered browse of /api/experiences?kind=.
const KIND_FILTERS: { value: PlaceKind | null; label: string }[] = [
  { value: null, label: "All" },
  { value: "spot", label: "Spots" },
  { value: "cafe", label: "Cafés" },
  { value: "nightlife", label: "Nightlife" },
  { value: "historical", label: "Historic" },
  { value: "cultural", label: "Cultural" },
  { value: "workshop", label: "Workshops" },
  { value: "event", label: "Events" },
];

export default function Feed() {
  const { profile } = useSession();
  const [data, setData] = useState<FeedResult | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter state: the selected kind and its browse results (null = curated feed).
  const [kind, setKind] = useState<PlaceKind | null>(null);
  const [browse, setBrowse] = useState<Experience[] | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);

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

  // Load (or clear) the filtered browse list whenever the selected kind changes.
  useEffect(() => {
    if (!kind) {
      setBrowse(null);
      return;
    }
    let active = true;
    setBrowseLoading(true);
    setError(null);
    api
      .experiences({ kind, limit: 30 })
      .then((r) => {
        if (active) setBrowse(r.items);
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "Could not load that filter",
          );
      })
      .finally(() => {
        if (active) setBrowseLoading(false);
      });
    return () => {
      active = false;
    };
  }, [kind]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const greeting = profile?.display_name
    ? `, ${profile.display_name.split(" ")[0]}`
    : "";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Halo style={{ top: -100, left: -40, right: -40, height: 300 }} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
      >
        <Eyebrow>Outsidermap · tonight in delhi</Eyebrow>
        <Text variant="title" style={styles.h1}>
          Where to{greeting}.
        </Text>

        <KindChips selected={kind} onSelect={setKind} />

        {!data && !error && !kind && (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.accent} />
          </View>
        )}
        {error && (
          <Text variant="small" style={styles.error}>
            {error}
          </Text>
        )}

        {/* Filtered browse view */}
        {kind && (
          <View style={styles.section}>
            {browseLoading && (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.accent} />
              </View>
            )}
            {!browseLoading && browse && browse.length === 0 && (
              <Text variant="small" style={styles.empty}>
                Nothing here yet. Try another filter.
              </Text>
            )}
            {!browseLoading && browse && (
              <View style={{ gap: space.lg }}>
                {browse.map((x, i) => (
                  <MotiView
                    key={x.id}
                    from={{ opacity: 0, translateY: 12 }}
                    animate={{ opacity: 1, translateY: 0 }}
                    transition={{ type: "timing", duration: 320, delay: i * 40 }}
                  >
                    <ExperienceCard experience={x} />
                  </MotiView>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Curated feed (only when no filter is active) */}
        {!kind && data && (
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
                    <Text variant="heading" numberOfLines={1}>
                      {e.title}
                    </Text>
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

function KindChips({
  selected,
  onSelect,
}: {
  selected: PlaceKind | null;
  onSelect: (k: PlaceKind | null) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chips}
      style={styles.chipScroll}
    >
      {KIND_FILTERS.map((f) => {
        const active = f.value === selected;
        return (
          <Pressable
            key={f.label}
            onPress={() => onSelect(f.value)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text
              variant="small"
              style={[styles.chipText, active && styles.chipTextActive]}
            >
              {f.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
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
  chipScroll: { marginTop: space.lg, marginHorizontal: -space.xl },
  chips: { paddingHorizontal: space.xl, gap: space.sm },
  chip: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  chipText: { color: colors.inkDim },
  chipTextActive: { color: colors.night },
  eventRow: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    padding: space.lg,
    gap: 2,
  },
});
