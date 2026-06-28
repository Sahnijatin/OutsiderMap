import { Text as RNText, type TextProps, StyleSheet } from "react-native";
import { type, voice } from "@/theme";

type Variant = keyof typeof type;

export function Text({
  variant = "body",
  style,
  ...props
}: TextProps & { variant?: Variant }) {
  return <RNText style={[type[variant], style]} {...props} />;
}

/** The mono, wide-tracked, uppercase "system voice" (eyebrows, timestamps). */
export function Eyebrow({ style, ...props }: TextProps) {
  return <RNText style={[styles.eyebrow, style]} {...props} />;
}

const styles = StyleSheet.create({
  eyebrow: voice,
});
