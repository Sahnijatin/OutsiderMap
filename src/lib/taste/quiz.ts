/**
 * The onboarding quiz. Seven questions, two minutes, version 1 of the
 * taste profile. Shared by the onboarding UI and the extraction prompt -
 * no server-only import here.
 */

export const QUIZ_VERSION = 1;

export type QuizQuestion = {
  id: string;
  kind: "single" | "multi" | "text";
  eyebrow: string;
  title: string;
  hint?: string;
  options?: { value: string; label: string; detail?: string }[];
};

export const QUIZ: QuizQuestion[] = [
  {
    id: "hours",
    kind: "single",
    eyebrow: "01 / when",
    title: "When does your city happen?",
    options: [
      { value: "morning", label: "Early", detail: "chai before the noise" },
      { value: "golden-hour", label: "Golden hour", detail: "5-8pm person" },
      { value: "after-dark", label: "After dark", detail: "dinner is the start" },
      { value: "past-midnight", label: "Past midnight", detail: "the 3am shift" },
    ],
  },
  {
    id: "appetite",
    kind: "single",
    eyebrow: "02 / appetite",
    title: "On an unfamiliar menu, you…",
    options: [
      { value: "usual", label: "Order the usual", detail: "comfort is the point" },
      { value: "safe-new", label: "Try the chef's pick", detail: "new, but vetted" },
      { value: "adventurous", label: "Point at random", detail: "surprise me" },
      { value: "feral", label: "Eat the thing with no name", detail: "stories > safety" },
    ],
  },
  {
    id: "repair",
    kind: "single",
    eyebrow: "03 / repair",
    title: "What fixes a bad day?",
    options: [
      { value: "chai-quiet", label: "Chai and quiet", detail: "a corner, no talking" },
      { value: "butter-company", label: "Butter chicken and company", detail: "feed the feeling" },
      { value: "long-walk", label: "A long walk somewhere old", detail: "ruins help" },
      { value: "loud-drink", label: "Loud music and a drink", detail: "sweat it out" },
    ],
  },
  {
    id: "budget",
    kind: "single",
    eyebrow: "04 / damage",
    title: "A great night out usually costs you…",
    options: [
      { value: "1", label: "Under ₹500", detail: "the best food is street food" },
      { value: "2", label: "₹500-1,500", detail: "good food, no ceremony" },
      { value: "3", label: "₹1,500-4,000", detail: "cocktails count" },
      { value: "4", label: "Money isn't the point", detail: "the night decides" },
    ],
  },
  {
    id: "corner",
    kind: "single",
    eyebrow: "05 / habitat",
    title: "Pick your ideal corner.",
    options: [
      { value: "hole-in-the-wall", label: "A hole-in-the-wall", detail: "four tables, one genius" },
      { value: "courtyard", label: "A heritage courtyard", detail: "old stone, slow time" },
      { value: "rooftop", label: "A rooftop over the noise", detail: "the city as backdrop" },
      { value: "basement", label: "A basement with a queue", detail: "if you know, you know" },
    ],
  },
  {
    id: "areas",
    kind: "multi",
    eyebrow: "06 / territory",
    title: "Which parts of Delhi do you haunt?",
    hint: "Pick as many as are true.",
    options: [
      { value: "Connaught Place", label: "CP & around" },
      { value: "Khan Market", label: "Khan Market" },
      { value: "Hauz Khas", label: "Hauz Khas" },
      { value: "Greater Kailash", label: "GK" },
      { value: "Saket", label: "Saket & Mehrauli" },
      { value: "Old Delhi", label: "Old Delhi" },
      { value: "Shahpur Jat", label: "Shahpur Jat & Champa Gali" },
      { value: "Majnu ka Tilla", label: "Majnu ka Tilla" },
      { value: "everywhere", label: "All of it" },
    ],
  },
  {
    id: "perfect-night",
    kind: "text",
    eyebrow: "07 / evidence",
    title: "Describe a recent perfect night - out or in.",
    hint: "Plain words. Where you were, what you ate, who was there, why it worked. This is the part we read closely.",
  },
];

export type QuizAnswers = Record<string, string | string[]>;

/** Renders answers as readable lines for the LLM prompts. */
export function answersToText(answers: QuizAnswers) {
  return QUIZ.map((q) => {
    const raw = answers[q.id];
    if (raw == null || raw === "" || (Array.isArray(raw) && raw.length === 0)) {
      return `${q.title}\n- (skipped)`;
    }
    if (q.kind === "text") {
      return `${q.title}\n- ${raw}`;
    }
    const values = Array.isArray(raw) ? raw : [raw];
    const labels = values.map(
      (v) => q.options?.find((o) => o.value === v)?.label ?? v,
    );
    return `${q.title}\n- ${labels.join(", ")}`;
  }).join("\n\n");
}
