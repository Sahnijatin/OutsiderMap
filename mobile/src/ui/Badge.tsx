import { View, StyleSheet } from "react-native";
import { colors, radius, fonts } from "@/theme";
import { Text } from "@/ui/Text";

export function Badge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "amber" | "under";
}) {
  return (
    <View
      style={[
        styles.badge,
        tone === "amber" && styles.amber,
        tone === "under" && styles.under,
      ]}
    >
      <Text
        style={[
          styles.label,
          tone === "amber" && { color: colors.accent },
          tone === "under" && { color: colors.under },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.raise,
    borderWidth: 1,
    borderColor: colors.line,
    alignSelf: "flex-start",
  },
  amber: { borderColor: "rgba(240,164,49,0.4)", backgroundColor: "rgba(240,164,49,0.08)" },
  under: { borderColor: "rgba(180,138,237,0.4)", backgroundColor: "rgba(180,138,237,0.08)" },
  label: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: colors.inkDim },
});
