import { View, StyleSheet } from "react-native";
import { colors } from "@/theme";

/** Segmented IG/Snap-style progress bars across the top of the story view. */
export function StoryProgress({
  count,
  index,
}: {
  count: number;
  index: number;
}) {
  return (
    <View style={styles.row}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.track}>
          <View
            style={[
              styles.fill,
              { width: i < index ? "100%" : i === index ? "100%" : "0%" },
            ]}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 4 },
  track: {
    flex: 1,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: "rgba(237,231,219,0.25)",
    overflow: "hidden",
  },
  fill: { height: "100%", backgroundColor: colors.ink },
});
