import { Reveal, RevealItem } from "@/components/motion/reveal";
import { ButtonLink } from "@/components/ui/button";

export function ClosingCta() {
  return (
    <section className="relative overflow-hidden px-6 py-32">
      <div className="halo absolute inset-0" />
      <Reveal className="relative mx-auto flex max-w-2xl flex-col items-center gap-8 text-center">
        <RevealItem>
          <h2 className="font-display text-4xl leading-tight sm:text-6xl">
            The city already knows{" "}
            <span className="italic text-accent">you’re coming.</span>
          </h2>
        </RevealItem>
        <RevealItem>
          <ButtonLink href="/sign-in" size="lg">
            Become an outsider
          </ButtonLink>
        </RevealItem>
        <RevealItem>
          <p className="font-mono text-xs text-ink-dim/60">
            Free to explore · earn your way deeper
          </p>
        </RevealItem>
      </Reveal>
    </section>
  );
}
