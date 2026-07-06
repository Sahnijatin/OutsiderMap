import type { ComponentType } from "react";

/**
 * The brand's signature moment: scattered lights converging to one point.
 * Two implementations, picked at runtime:
 *  - Skia (one GPU canvas) in dev/production builds.
 *  - Reanimated/Moti fallback in Expo Go, where the Skia native module isn't
 *    linked and requiring it throws.
 */
type Props = {
  size?: number;
  tone?: "amber" | "violet";
  dots?: number;
};

let Impl: ComponentType<Props>;
try {
  // Throws in Expo Go (no Skia native module) — caught below.
  Impl = (require("./convergence-field-skia") as typeof import("./convergence-field-skia"))
    .ConvergenceFieldSkia;
} catch {
  Impl = (require("./convergence-field-fallback") as typeof import("./convergence-field-fallback"))
    .ConvergenceFieldFallback;
}

export function ConvergenceField(props: Props) {
  return <Impl {...props} />;
}
