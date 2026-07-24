import { redirect } from "next/navigation";

/**
 * Member submissions retired; scouting runs through the admin ingest inbox.
 * The intended replacement - long-press a spot on the map to submit it - is a
 * live TODO and is not built yet (see the map canvas + issue #47). Until it
 * lands there is no member-facing place-submission path.
 */
export default function SubmitRedirect() {
  redirect("/profile");
}
