import { redirect } from "next/navigation";

/** The weekend planner grew up into quests. */
export default function WeekendRedirect() {
  redirect("/quests");
}
