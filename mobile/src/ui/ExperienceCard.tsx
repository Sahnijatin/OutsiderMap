import { Pressable, View, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { colors, radius, space, fonts } from "@/theme";
import { Text } from "@/ui/Text";
import { Badge } from "@/ui/Badge";
import { mediaUrl } from "@/lib/api";
import type { Experience } from "@/lib/types";

export function ExperienceCard({
  experience,
  reason,
  large = false,
}: {
  experience: Experience;
  reason?: string;
  large?: boolean;
}) {
  const router = useRouter();
  const uri = mediaUrl(experience.image_path);

  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        router.push(`/experience/${experience.slug}`);
      }}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={[styles.imageWrap, { height: large ? 220 : 150 }]}>
        {uri ? (
          <Image source={{ uri }} style={styles.image} contentFit="cover" transition={300} />
        ) : (
          <View style={[styles.image, styles.placeholder]} />
        )}
        {experience.kind && experience.kind !== "spot" && (
          <View style={styles.badge}>
            <Badge label={experience.kind} tone="amber" />
          </View>
        )}
      </View>
      <View style={styles.body}>
        <Text variant="heading" numberOfLines={1}>{experience.name}</Text>
        <Text variant="small" style={styles.meta} numberOfLines={1}>
          {[experience.area, experience.openLabel].filter(Boolean).join(" · ")}
        </Text>
        {reason ? (
          <Text variant="body" style={styles.reason}>{reason}</Text>
        ) : experience.description ? (
          <Text variant="small" style={styles.desc} numberOfLines={2}>
            {experience.description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
  },
  pressed: { opacity: 0.92, transform: [{ scale: 0.995 }] },
  imageWrap: { width: "100%", backgroundColor: colors.raise },
  image: { width: "100%", height: "100%" },
  placeholder: { backgroundColor: colors.raise },
  badge: { position: "absolute", top: space.md, left: space.md },
  body: { padding: space.lg, gap: 4 },
  meta: { fontFamily: fonts.mono, letterSpacing: 0.5 },
  reason: { marginTop: space.xs, color: colors.ink },
  desc: { marginTop: space.xs },
});
