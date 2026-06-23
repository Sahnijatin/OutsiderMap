import { useEffect, useState } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  Dimensions,
  Pressable,
  ActivityIndicator,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { api, mediaUrl } from "@/lib/api";
import type { ExperienceDetail, InteractionAction } from "@/lib/types";
import { colors, space, fonts, radius } from "@/theme";
import { Text, Eyebrow } from "@/ui/Text";
import { Badge } from "@/ui/Badge";
import { StoryProgress } from "@/ui/StoryProgress";

const { width } = Dimensions.get("window");
const STORY_H = Math.min(width * 1.25, 520);

export default function ExperienceScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const [data, setData] = useState<ExperienceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState(0);
  const [status, setStatus] = useState<"none" | "saved" | "started" | "completed">("none");

  useEffect(() => {
    if (!slug) return;
    api
      .experience(slug)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Not found"));
  }, [slug]);

  async function act(action: InteractionAction, nextStatus: typeof status) {
    if (!data) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStatus(nextStatus);
    try {
      await api.interact(action, data.id);
    } catch {
      // best-effort; the optimistic state stays
    }
  }

  if (error) {
    return (
      <SafeAreaView style={styles.center}>
        <Text variant="body">{error}</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: space.lg }}>
          <Text style={{ color: colors.accent }}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const story = data.story?.filter((c) => c.media_path || c.caption) ?? [];
  const heroUri = mediaUrl(data.image_path);

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== card) {
      setCard(i);
      Haptics.selectionAsync();
    }
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Story / hero */}
        <View style={{ height: STORY_H }}>
          {story.length > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={onScroll}
              scrollEventThrottle={16}
            >
              {story.map((c, i) => {
                const uri = mediaUrl(c.media_path, "experience-media") ?? heroUri;
                return (
                  <View key={i} style={{ width, height: STORY_H }}>
                    {uri ? (
                      <Image source={{ uri }} style={styles.media} contentFit="cover" transition={250} />
                    ) : (
                      <View style={[styles.media, { backgroundColor: colors.raise }]} />
                    )}
                    <LinearGradient
                      colors={["transparent", "rgba(12,10,8,0.9)"]}
                      style={styles.scrim}
                    />
                    {c.caption && (
                      <Text variant="body" style={styles.caption}>{c.caption}</Text>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          ) : heroUri ? (
            <Image source={{ uri: heroUri }} style={styles.media} contentFit="cover" />
          ) : (
            <View style={[styles.media, { backgroundColor: colors.raise }]} />
          )}

          {story.length > 1 && (
            <View style={styles.progress}>
              <StoryProgress count={story.length} index={card} />
            </View>
          )}

          <SafeAreaView style={styles.closeWrap} edges={["top"]}>
            <Pressable onPress={() => router.back()} hitSlop={12} style={styles.close}>
              <Ionicons name="close" size={22} color={colors.ink} />
            </Pressable>
          </SafeAreaView>
        </View>

        {/* Info */}
        <View style={styles.body}>
          {data.kind && data.kind !== "spot" && <Badge label={data.kind} tone="amber" />}
          <Text variant="title" style={styles.name}>{data.name}</Text>
          <Eyebrow style={styles.meta}>
            {[data.area, data.openLabel].filter(Boolean).join(" · ")}
          </Eyebrow>

          {data.description && (
            <Text variant="body" style={styles.desc}>{data.description}</Text>
          )}
          {data.editor_note && (
            <View style={styles.note}>
              <Eyebrow>Editor's note</Eyebrow>
              <Text variant="body" style={styles.noteText}>{data.editor_note}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Action bar */}
      <SafeAreaView style={styles.actionsWrap} edges={["bottom"]}>
        <View style={styles.actions}>
          <ActionButton
            icon={status === "saved" || status === "started" || status === "completed" ? "bookmark" : "bookmark-outline"}
            label="Save"
            active={status !== "none"}
            onPress={() => act("save", "saved")}
          />
          <ActionButton
            icon="play-outline"
            label="Start"
            active={status === "started"}
            onPress={() => act("start", "started")}
          />
          <ActionButton
            icon={status === "completed" ? "checkmark-circle" : "checkmark-circle-outline"}
            label="Done"
            active={status === "completed"}
            onPress={() => act("complete", "completed")}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

function ActionButton({
  icon,
  label,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.action}>
      <Ionicons name={icon} size={22} color={active ? colors.accent : colors.ink} />
      <Text style={[styles.actionLabel, active && { color: colors.accent }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.night },
  center: { flex: 1, backgroundColor: colors.night, alignItems: "center", justifyContent: "center" },
  scroll: { paddingBottom: 120 },
  media: { width: "100%", height: "100%" },
  scrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: "55%" },
  caption: {
    position: "absolute",
    bottom: space.xl,
    left: space.xl,
    right: space.xl,
    color: colors.ink,
  },
  progress: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: space.lg, paddingTop: space.sm },
  closeWrap: { position: "absolute", top: 0, right: 0 },
  close: {
    margin: space.lg,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(12,10,8,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  body: { padding: space.xl, gap: space.sm },
  name: { marginTop: space.sm },
  meta: {},
  desc: { marginTop: space.md },
  note: {
    marginTop: space.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: space.lg,
    gap: space.xs,
  },
  noteText: {},
  actionsWrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  actions: { flexDirection: "row", justifyContent: "space-around", paddingVertical: space.md },
  action: { alignItems: "center", gap: 4, paddingHorizontal: space.lg },
  actionLabel: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, color: colors.ink, textTransform: "uppercase" },
});
