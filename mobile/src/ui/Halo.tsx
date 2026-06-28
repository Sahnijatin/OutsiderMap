import { View, type ViewStyle, type StyleProp } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

/**
 * The recurring sodium-lamp glow. RN has no radial gradient primitive, so we
 * fake the halo with a soft vertical amber (or violet) gradient fading to
 * transparent - it reads as a light source behind hero content.
 */
export function Halo({
  tone = "amber",
  style,
}: {
  tone?: "amber" | "violet";
  style?: StyleProp<ViewStyle>;
}) {
  const top =
    tone === "violet" ? "rgba(180,138,237,0.16)" : "rgba(240,164,49,0.18)";
  const mid =
    tone === "violet" ? "rgba(180,138,237,0.05)" : "rgba(240,164,49,0.06)";
  return (
    <View pointerEvents="none" style={[{ position: "absolute" }, style]}>
      <LinearGradient
        colors={[top, mid, "transparent"]}
        locations={[0, 0.4, 1]}
        style={{ flex: 1, borderRadius: 999 }}
      />
    </View>
  );
}
