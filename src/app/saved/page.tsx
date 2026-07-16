import { redirect } from "next/navigation";

/** The bucket lives on the profile now. */
export default function SavedRedirect() {
  redirect("/profile");
}
