import { redirect } from "next/navigation";

/** Right Now's job is answered by the concierge; /api/now remains for mobile. */
export default function NowRedirect() {
  redirect("/chat");
}
