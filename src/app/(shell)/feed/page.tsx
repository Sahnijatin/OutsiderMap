import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/auth";
import { FeedClient } from "./feed-client";

export const metadata: Metadata = { title: "Feed" };

/** The social feed: Home (your network) and Discover (public), place-anchored. */
export default async function FeedPage() {
  await requireOnboarded();
  return <FeedClient />;
}
