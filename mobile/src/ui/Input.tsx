import { TextInput, type TextInputProps, StyleSheet } from "react-native";
import { colors, radius, fonts } from "@/theme";

export function Input(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.inkDim}
      style={styles.input}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.raise,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: 16,
  },
});
