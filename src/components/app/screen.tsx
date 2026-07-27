import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

type Width = "default" | "wide" | "narrow";

const WIDTHS: Record<Width, string> = {
  default: "max-w-2xl lg:max-w-4xl",
  wide: "max-w-2xl lg:max-w-5xl",
  narrow: "max-w-xl",
};

/**
 * THE page container - every routed screen renders inside one of these so the
 * app has exactly one gutter, one measure, and one safe-area treatment.
 * Vertical padding uses the safe-area tokens (never pt-4/pb-28 magic): the
 * installed PWA/WebView draws under the notch and behind the tab bar, so
 * --safe-top and --tab-clearance are the only honest offsets.
 * `inset={false}` is the escape hatch for full-bleed screens (the map, the
 * chat split pane) that own their geometry.
 */
export function Screen({
  width = "default",
  inset = true,
  className,
  ...props
}: ComponentPropsWithoutRef<"main"> & { width?: Width; inset?: boolean }) {
  return (
    <main
      className={cn(
        "min-h-dvh w-full",
        inset &&
          cn(
            "mx-auto px-5 pt-[calc(var(--safe-top)+1.5rem)] pb-[calc(var(--tab-clearance)+2rem)]",
            WIDTHS[width],
          ),
        className,
      )}
      {...props}
    />
  );
}
