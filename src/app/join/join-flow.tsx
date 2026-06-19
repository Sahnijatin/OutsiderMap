"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { submitApplication } from "./actions";

declare global {
  interface Window {
    gtag?: (command: string, ...args: unknown[]) => void;
  }
}

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Client-side preview code, shown in step 2 before submission. The success
 *  screen always shows the server's authoritative code. */
function previewReferralCode() {
  let code = "";
  for (let i = 0; i < 4; i += 1) {
    code += REF_ALPHABET[Math.floor(Math.random() * REF_ALPHABET.length)];
  }
  return `OUT-${code}`;
}

type Step = 1 | 2 | 3;

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  gender: string;
  city: string;
  instagram: string;
  referredBy: string;
  spotArea: string;
  spotDescription: string;
};

const EMPTY: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  gender: "",
  city: "",
  instagram: "",
  referredBy: "",
  spotArea: "",
  spotDescription: "",
};

const stepVariants = {
  enter: { opacity: 0, y: 16 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
};

export function JoinFlow({ defaultReferral }: { defaultReferral: string }) {
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormState>({
    ...EMPTY,
    referredBy: defaultReferral,
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Authoritative code is set from the server response on success.
  const [serverCode, setServerCode] = useState<string | null>(null);
  const previewCode = useMemo(() => previewReferralCode(), []);
  const code = serverCode ?? previewCode;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function continueToStep2(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStep(2);
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const data = new FormData();
      data.set("firstName", form.firstName);
      data.set("lastName", form.lastName);
      data.set("email", form.email);
      data.set("phone", form.phone);
      data.set("gender", form.gender);
      data.set("city", form.city);
      data.set("instagram", form.instagram);
      data.set("referredBy", form.referredBy);
      data.set("spotArea", form.spotArea);
      data.set("spotDescription", form.spotDescription);
      if (photo) data.set("spotPhoto", photo);

      const result = await submitApplication(data);
      setServerCode(result.referralCode);
      // Conversion signal for GA4 / Google Ads (the base tag is in the layout).
      window.gtag?.("event", "generate_lead", {
        method: "waitlist",
        dropped_spot: form.spotDescription.trim().length >= 10,
      });
      setStep(3);
    } catch {
      setError(
        "Something went wrong sending that in. Give it a second and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <StepDots step={step} />
      <div className="mt-6 rounded-card border border-line bg-surface/80 p-6 backdrop-blur-sm sm:p-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          >
            {step === 1 && (
              <StepDetails
                form={form}
                set={set}
                onSubmit={continueToStep2}
              />
            )}
            {step === 2 && (
              <StepStandOut
                code={code}
                form={form}
                set={set}
                photo={photo}
                setPhoto={setPhoto}
                submitting={submitting}
                error={error}
                onSubmit={submit}
              />
            )}
            {step === 3 && <StepDone code={code} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function StepDots({ step }: { step: Step }) {
  return (
    <div
      className="flex items-center gap-2"
      aria-label={`Step ${step} of 3`}
    >
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className={cn(
            "h-1 flex-1 rounded-full transition-colors duration-500",
            n <= step ? "bg-accent" : "bg-line",
          )}
        />
      ))}
    </div>
  );
}

function StepDetails({
  form,
  set,
  onSubmit,
}: {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <p className="voice">The first 100 outsiders</p>
        <h1 className="font-display text-4xl leading-[1.05] sm:text-5xl">
          Become an Outsider.
        </h1>
        <p className="text-sm leading-relaxed text-ink-dim">
          We&rsquo;re not running a race. We&rsquo;re choosing 100 outsiders
          ourselves. Good things take time. We open July 10.
        </p>
      </header>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="First name" htmlFor="firstName">
          <Input
            id="firstName"
            value={form.firstName}
            onChange={(e) => set("firstName", e.target.value)}
            placeholder="Sam"
            autoComplete="given-name"
            required
            maxLength={60}
          />
        </Field>
        <Field label="Last name" htmlFor="lastName">
          <Input
            id="lastName"
            value={form.lastName}
            onChange={(e) => set("lastName", e.target.value)}
            placeholder="Kapoor"
            autoComplete="family-name"
            required
            maxLength={60}
          />
        </Field>
      </div>

      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          type="email"
          value={form.email}
          onChange={(e) => set("email", e.target.value)}
          placeholder="you@email.com"
          autoComplete="email"
          required
          maxLength={160}
        />
      </Field>

      <Field label="Phone number" htmlFor="phone">
        <Input
          id="phone"
          type="tel"
          value={form.phone}
          onChange={(e) => set("phone", e.target.value)}
          placeholder="+91 98765 43210"
          autoComplete="tel"
          required
          minLength={6}
          maxLength={24}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Gender" htmlFor="gender">
          <Select
            id="gender"
            value={form.gender}
            onChange={(e) => set("gender", e.target.value)}
          >
            <option value="">Select</option>
            <option value="woman">Woman</option>
            <option value="man">Man</option>
            <option value="non-binary">Non-binary</option>
            <option value="prefer-not-to-say">Prefer not to say</option>
          </Select>
        </Field>
        <Field label="Your city" htmlFor="city">
          <Input
            id="city"
            value={form.city}
            onChange={(e) => set("city", e.target.value)}
            placeholder="City"
            autoComplete="address-level2"
            required
            maxLength={80}
          />
        </Field>
      </div>

      <Field label="Instagram" htmlFor="instagram">
        <Input
          id="instagram"
          value={form.instagram}
          onChange={(e) => set("instagram", e.target.value)}
          placeholder="@ yourhandle"
          maxLength={60}
        />
      </Field>

      <Field label="Referral code · optional" htmlFor="referredBy">
        <Input
          id="referredBy"
          value={form.referredBy}
          onChange={(e) => set("referredBy", e.target.value)}
          placeholder="Add a code if you have one"
          maxLength={24}
          className="uppercase placeholder:normal-case"
        />
      </Field>

      <Button type="submit" size="lg" className="mt-1 w-full">
        Continue
      </Button>
    </form>
  );
}

function StepStandOut({
  code,
  form,
  set,
  photo,
  setPhoto,
  submitting,
  error,
  onSubmit,
}: {
  code: string;
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  photo: File | null;
  setPhoto: (f: File | null) => void;
  submitting: boolean;
  error: string | null;
  onSubmit: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <p className="voice">Optional</p>
        <h1 className="font-display text-4xl leading-[1.05] sm:text-5xl">
          Stand out.
        </h1>
        <p className="text-sm leading-relaxed text-ink-dim">
          Do one, do both, or skip it. We look at everything when we decide.
        </p>
      </header>

      {/* Bring someone in */}
      <section className="flex flex-col gap-3 rounded-card border border-line bg-night/40 p-5">
        <div className="flex items-center gap-2.5">
          <UsersIcon />
          <h2 className="font-medium">Bring someone in.</h2>
        </div>
        <p className="text-sm text-ink-dim">
          Every friend who applies with your code puts you higher on our list.
        </p>
        <CodeRow code={code} variant="code" />
      </section>

      {/* Drop a spot */}
      <section className="flex flex-col gap-4 rounded-card border border-line bg-night/40 p-5">
        <div className="flex items-center gap-2.5">
          <PinIcon />
          <h2 className="font-medium">Drop a spot.</h2>
        </div>
        <p className="text-sm text-ink-dim">
          A place you&rsquo;ve never posted about. Show us what you know.
        </p>

        <PhotoInput photo={photo} setPhoto={setPhoto} />

        <Field label="Where is it" htmlFor="spotArea">
          <Input
            id="spotArea"
            value={form.spotArea}
            onChange={(e) => set("spotArea", e.target.value)}
            placeholder="Area or neighbourhood"
            maxLength={120}
          />
        </Field>
        <Field
          label="What makes it the one"
          htmlFor="spotDescription"
          hint="Tell us in a sentence or two — at least 10 characters to submit it."
        >
          <Textarea
            id="spotDescription"
            value={form.spotDescription}
            onChange={(e) => set("spotDescription", e.target.value)}
            placeholder="No sign. No queue. Just the people who already know."
            rows={3}
            maxLength={1000}
          />
        </Field>
      </section>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-col items-center gap-3">
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={submitting}
          onClick={onSubmit}
        >
          {submitting ? "Sending…" : "Put me forward"}
        </Button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="text-sm text-ink-dim transition-colors hover:text-ink disabled:opacity-50"
        >
          Skip — just put my name down
        </button>
      </div>
    </div>
  );
}

function StepDone({ code }: { code: string }) {
  return (
    <div className="flex flex-col items-center gap-5 py-2 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-accent text-night">
        <CheckIcon />
      </span>
      <p className="voice">Application in.</p>
      <h1 className="font-display text-4xl leading-[1.05] sm:text-5xl">
        We&rsquo;ll be in touch.
      </h1>
      <p className="max-w-sm text-sm leading-relaxed text-ink-dim">
        We&rsquo;re going through every application. The first 100 outsiders get
        early access to every spot, every drop, and every area before anyone
        else sees it.
      </p>

      <div className="w-full rounded-card border border-line bg-night/40 p-5 text-left">
        <p className="voice mb-2">Your referral code</p>
        <CodeRow code={code} variant="link" />
        <p className="mt-3 text-sm text-ink-dim">
          Share it. Every friend who applies with this puts you closer to
          getting picked.
        </p>
      </div>

      <p className="text-sm text-ink-dim">
        Follow{" "}
        <a
          href="https://instagram.com/outsidermap"
          target="_blank"
          rel="noreferrer"
          className="text-accent hover:underline"
        >
          @outsidermap
        </a>
        . Hidden spots dropping every day until we open.
      </p>
    </div>
  );
}

/** Shows the code with a copy button. `variant` decides whether the button
 *  copies the bare code or a full referral link. */
function CodeRow({ code, variant }: { code: string; variant: "code" | "link" }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function copy() {
    const value =
      variant === "link"
        ? `${typeof window !== "undefined" ? window.location.origin : ""}/join?ref=${code}`
        : code;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked (e.g. insecure context) — no-op; code is visible.
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
      <span className="font-mono text-lg tracking-[0.2em] text-accent">
        {code}
      </span>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 text-sm text-ink-dim transition-colors hover:text-ink"
      >
        {copied ? "Copied" : variant === "link" ? "Copy link" : "Copy code"}
      </button>
    </div>
  );
}

function PhotoInput({
  photo,
  setPhoto,
}: {
  photo: File | null;
  setPhoto: (f: File | null) => void;
}) {
  const preview = useMemo(
    () => (photo ? URL.createObjectURL(photo) : null),
    [photo],
  );

  return (
    <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-surface px-4 py-6 text-center transition-colors hover:border-ink-dim">
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
      />
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt="Selected spot preview"
          className="max-h-40 w-auto rounded-lg object-cover"
        />
      ) : (
        <>
          <CameraIcon />
          <span className="text-sm text-ink-dim">Add a photo</span>
        </>
      )}
      {photo && (
        <span className="text-xs text-ink-dim/70">
          {photo.name} · tap to change
        </span>
      )}
    </label>
  );
}

/* ---- Inline icons (lucide-react isn't used in this codebase) ------------- */

function iconProps(extra?: string) {
  return {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: cn("text-accent", extra),
  };
}

function UsersIcon() {
  return (
    <svg {...iconProps()} aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg {...iconProps()} aria-hidden>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg {...iconProps("text-ink-dim")} width={22} height={22} aria-hidden>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width={26}
      height={26}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
