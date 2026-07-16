import { redirect } from "next/navigation";

/** Member submissions retired; scouting runs through the admin ingest inbox. */
export default function SubmitRedirect() {
  redirect("/profile");
}
