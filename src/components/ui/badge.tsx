import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "accent" | "under" | "outline";

const variants: Record<Variant, string> = {
  default: "bg-raise text-ink-dim",
  accent: "bg-accent/15 text-accent",
  under: "bg-under/15 text-under",
  outline: "border border-line text-ink-dim",
};

export function Badge({
  variant = "default",
  className,
  ...props
}: ComponentPropsWithoutRef<"span"> & { variant?: Variant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
