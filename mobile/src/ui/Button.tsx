import { Pressable, ActivityIndicator, StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";
import { colors, radius, fonts } from "@/theme";
import { Text } from "@/ui/Text";

type Variant = "primary" | "ghost" | "under";

export function Button({
  label,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  haptic = true,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  haptic?: boolean;
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={() => {
        if (isDisabled) return;
        if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variant === "primary" && styles.primary,
        variant === "ghost" && styles.ghost,
        variant === "under" && styles.under,
        pressed && styles.pressed,
        isDisabled && styles.disabled,
      ]}
    >
      <View style={styles.row}>
        {loading && (
          <ActivityIndicator
            size="small"
            color={variant === "primary" ? colors.night : colors.ink}
          />
        )}
        <Text
          style={[
            styles.label,
            variant === "primary" ? styles.labelDark : styles.labelLight,
          ]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  primary: { backgroundColor: colors.accent },
  ghost: { borderWidth: 1, borderColor: colors.line, backgroundColor: "transparent" },
  under: { backgroundColor: colors.under },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.45 },
  label: { fontFamily: fonts.bodyMedium, fontSize: 16 },
  labelDark: { color: colors.night },
  labelLight: { color: colors.ink },
});
