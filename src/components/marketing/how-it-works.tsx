import { Reveal, RevealItem } from "@/components/motion/reveal";

const steps = [
  {
    number: "01",
    title: "Answer seven questions",
    body: "A two-minute quiz — how you eat, where you like to sit, what “late” means to you. That becomes your taste profile, version one.",
  },
  {
    number: "02",
    title: "It sharpens with use",
    body: "Every ask, save, and skip teaches it. The profile learns from what you do, not just what you said once in a form.",
  },
  {
    number: "03",
    title: "Ask like you’d text a friend",
    body: "“im at GK, slightly heartbroken, want greasy food” gets one confident answer — a place, and exactly why it’s yours.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-5xl scroll-mt-24 px-6 py-28">
      <Reveal>
        <RevealItem>
          <p className="voice">How it learns you</p>
        </RevealItem>
        <RevealItem>
          <h2 className="mt-4 max-w-2xl font-display text-3xl sm:text-5xl">
            A profile that gets you,{" "}
            <span className="italic text-accent">then gets better.</span>
          </h2>
        </RevealItem>

        <div className="mt-16 grid gap-10 sm:grid-cols-3">
          {steps.map((step) => (
            <RevealItem key={step.number}>
              <div className="flex flex-col gap-4">
                <span className="font-mono text-sm text-accent">
                  {step.number}
                </span>
                <h3 className="font-display text-xl">{step.title}</h3>
                <p className="text-sm leading-relaxed text-ink-dim">
                  {step.body}
                </p>
              </div>
            </RevealItem>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
