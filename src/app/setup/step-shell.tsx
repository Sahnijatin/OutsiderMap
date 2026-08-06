import type { ReactNode } from "react";
import { ProTip } from "@/components/app/pro-tip";
import { setupStep, setupStepIndex, type SetupStepId } from "@/lib/setup/steps";
import { SetupProgress } from "./progress";

/**
 * The frame every static first-run screen sits in: wordmark, shared progress
 * bar, the step's own eyebrow/title/lead, the pro tip, then the screen's
 * controls.
 *
 * The quiz keeps its own layout because it animates between questions inside
 * one screen - but it renders the same SetupProgress and the same ProTip, so
 * the twelve screens read as one flow either way.
 */
export function SetupStepShell({
  id,
  children,
  footer,
  eyebrow,
}: {
  id: SetupStepId;
  children: ReactNode;
  /** Secondary controls - "Skip for now", "Not now". */
  footer?: ReactNode;
  /**
   * Replaces the step's own eyebrow. Only the username screen uses it, to keep
   * the outsider-number reveal - the one moment the flow spends the accent on
   * an eyebrow rather than keeping it quiet.
   */
  eyebrow?: ReactNode;
}) {
  const step = setupStep(id);

  return (
    <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col gap-8 px-6 pb-10 pt-[calc(var(--safe-top)+2.5rem)]">
      <div className="flex items-center justify-between">
        <span className="shrink-0 font-display text-lg italic">
          OutsiderMap
        </span>
        <SetupProgress index={setupStepIndex(id)} className="ml-4" />
      </div>

      <div className="om-stagger flex flex-1 flex-col justify-center gap-6 py-8">
        <div className="flex flex-col gap-3">
          {eyebrow ?? <p className="voice">{step.eyebrow}</p>}
          <h1 className="text-balance font-display text-3xl italic">
            {step.title}
          </h1>
          {step.lead && (
            <p className="text-pretty text-sm leading-relaxed text-ink-dim">
              {step.lead}
            </p>
          )}
        </div>

        <ProTip>{step.tip}</ProTip>

        {children}
      </div>

      {footer && <div className="flex h-8 items-center">{footer}</div>}
    </div>
  );
}
