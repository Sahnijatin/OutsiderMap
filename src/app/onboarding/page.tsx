import { redirect } from "next/navigation";

/** First-run and quiz-redo both live at /setup now. */
export default async function OnboardingRedirect({
  searchParams,
}: {
  searchParams: Promise<{ redo?: string }>;
}) {
  const { redo } = await searchParams;
  redirect(redo ? "/setup?redo=1" : "/setup");
}
