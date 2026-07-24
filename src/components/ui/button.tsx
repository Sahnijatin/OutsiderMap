import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "under";
type Size = "sm" | "md" | "lg";

// `active:scale` is what makes a tap feel answered. Without it every button on
// a phone reads as a dead rectangle - there's no hover on touch, so the pressed
// state was the only feedback available and we weren't using it. Transform +
// colour both transition; motion-reduce opts out of the squish.
const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-[color,background-color,border-color,transform] duration-200 ease-out active:scale-[0.97] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-night hover:bg-ember",
  secondary: "border border-line bg-transparent text-ink hover:border-ink-dim",
  ghost: "text-ink-dim hover:text-ink",
  danger: "border border-danger/40 text-danger hover:bg-danger/10",
  under: "bg-under text-night hover:bg-under/80",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-4 text-sm",
  md: "h-11 px-6 text-sm",
  lg: "h-13 px-8 text-base",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md") {
  return cn(base, variants[variant], sizes[size]);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentPropsWithoutRef<"button"> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(buttonClasses(variant, size), className)}
      {...props}
    />
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Link> & { variant?: Variant; size?: Size }) {
  return (
    <Link className={cn(buttonClasses(variant, size), className)} {...props} />
  );
}
