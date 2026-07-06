import { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import { MotiView } from "moti";
import { Easing } from "react-native-reanimated";
import { colors } from "@/theme";

/**
 * Expo Go fallback for the ConvergenceField: the original Reanimated/Moti
 * take (N animated views). The Skia version is preferred and used
 * automatically in dev/production builds — see ConvergenceField.tsx.
 */

/** Deterministic PRNG (mulberry32) so render stays pure — same seed, same field. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function ConvergenceFieldFallback({
  size = 240,
  tone = "amber",
  dots = 28,
}: {
  size?: number;
  tone?: "amber" | "violet";
  dots?: number;
}) {
  const color = tone === "violet" ? colors.under : colors.accent;
  const points = useMemo(() => {
    const rand = mulberry32(dots * 7919 + size);
    return Array.from({ length: dots }).map(() => {
      const angle = rand() * Math.PI * 2;
      const dist = (size / 2) * (0.4 + rand() * 0.6);
      return {
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        delay: rand() * 900,
        duration: 1200 + rand() * 900,
      };
    });
  }, [dots, size]);

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      {/* The answer at the center. */}
      <MotiView
        from={{ opacity: 0.4, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "timing", duration: 1600, loop: true, repeatReverse: true }}
        style={[styles.core, { backgroundColor: color, shadowColor: color }]}
      />
      {points.map((p, i) => (
        <MotiView
          key={i}
          from={{ translateX: p.x, translateY: p.y, opacity: 0 }}
          animate={{ translateX: 0, translateY: 0, opacity: 0.9 }}
          transition={{
            type: "timing",
            duration: p.duration,
            delay: p.delay,
            loop: true,
            repeatReverse: true,
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }}
          style={[styles.dot, { backgroundColor: color }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  core: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    shadowOpacity: 0.9,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  dot: { position: "absolute", width: 4, height: 4, borderRadius: 2 },
});
