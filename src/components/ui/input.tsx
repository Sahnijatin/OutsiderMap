import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

// No outline-none here: the global :focus-visible ring (globals.css) is the
// keyboard focus indicator; focus:border-accent is only an additive tint.
const fieldClasses =
  "w-full rounded-xl border border-line bg-surface px-4 py-3 text-ink placeholder:text-ink-dim/60 focus:border-accent transition-colors";

export function Input({
  className,
  ...props
}: ComponentPropsWithoutRef<"input">) {
  return <input className={cn(fieldClasses, className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: ComponentPropsWithoutRef<"textarea">) {
  return (
    <textarea
      className={cn(fieldClasses, "min-h-24 resize-y", className)}
      {...props}
    />
  );
}

export function Select({
  className,
  ...props
}: ComponentPropsWithoutRef<"select">) {
  return (
    <select
      className={cn(fieldClasses, "appearance-none", className)}
      {...props}
    />
  );
}
