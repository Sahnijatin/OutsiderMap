import { redirect } from "next/navigation";

/**
 * The front door is the map, for everyone (#116). Root sends every visitor —
 * signed in or not — to the explorable map; the brand story lives at /about.
 */
export default function RootPage() {
  redirect("/map");
}
