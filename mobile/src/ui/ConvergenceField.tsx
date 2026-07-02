import { useMemo } from "react";
import { Canvas, Circle, Group, useClock } from "@shopify/react-native-skia";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";
import { colors } from "@/theme";

/**
 * The brand's signature moment: a field of scattered lights that keeps
 * converging toward a single point - "ten thousand places, one answer". Used as
 * the onboarding finale and the Chat "thinking" state.
 *
 * Skia implementation: a single GPU clock drives every dot (and the core pulse)
 * through reanimated derived values, so the whole field is one canvas rather
 * than N animated views. Same public API as the previous Reanimated/Moti take.
 */

// Triangle wave 0 -> 1 -> 0 over 2*duration, delayed per dot. Worklet: runs on UI.
function pingPong(now: number, delay: number, duration: number): number {
  "worklet";
  const t = now - delay;
  if (t <= 0) return 0;
  const c = (t % (duration * 2)) / duration;
  return c <= 1 ? c : 2 - c;
}

// Smoothstep easing.
function smooth(p: number): number {
  "worklet";
  return p * p * (3 - 2 * p);
}

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

type Point = {
  x: number;
  y: number;
  delay: number;
  duration: number;
};

export function ConvergenceField({
  size = 240,
  tone = "amber",
  dots = 28,
}: {
  size?: number;
  tone?: "amber" | "violet";
  dots?: number;
}) {
  const color = tone === "violet" ? colors.under : colors.accent;
  const center = size / 2;
  const clock = useClock();

  const points = useMemo<Point[]>(() => {
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

  // Core pulse: opacity + radius breathe on a fixed 1.6s cycle.
  const coreRadius = useDerivedValue(
    () => 6 + 2 * smooth(pingPong(clock.value, 0, 800)),
  );
  const coreOpacity = useDerivedValue(
    () => 0.7 + 0.3 * smooth(pingPong(clock.value, 0, 800)),
  );
  const haloRadius = useDerivedValue(
    () => 14 + 5 * smooth(pingPong(clock.value, 0, 800)),
  );

  return (
    <Canvas style={{ width: size, height: size }}>
      <Group>
        {points.map((p, i) => (
          <Dot
            key={i}
            clock={clock}
            point={p}
            center={center}
            color={color}
          />
        ))}
      </Group>
      {/* Soft halo behind the core, then the core itself. */}
      <Circle
        cx={center}
        cy={center}
        r={haloRadius}
        color={color}
        opacity={0.18}
      />
      <Circle
        cx={center}
        cy={center}
        r={coreRadius}
        color={color}
        opacity={coreOpacity}
      />
    </Canvas>
  );
}

function Dot({
  clock,
  point,
  center,
  color,
}: {
  clock: SharedValue<number>;
  point: Point;
  center: number;
  color: string;
}) {
  // p=0 scattered (center + offset), p=1 converged (center).
  const cx = useDerivedValue(() => {
    const p = smooth(pingPong(clock.value, point.delay, point.duration));
    return center + point.x * (1 - p);
  });
  const cy = useDerivedValue(() => {
    const p = smooth(pingPong(clock.value, point.delay, point.duration));
    return center + point.y * (1 - p);
  });
  const opacity = useDerivedValue(() => {
    const p = smooth(pingPong(clock.value, point.delay, point.duration));
    return 0.15 + 0.75 * p;
  });

  return <Circle cx={cx} cy={cy} r={2} color={color} opacity={opacity} />;
}
