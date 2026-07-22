import { redirect } from "next/navigation";

/**
 * Reels folded into the Feed (epic #67): reels are now one post type
 * (type=video), not a separate surface. This route is kept as a permanent
 * redirect so old links/bookmarks land on the feed. The reels render pipeline
 * and the `reels` table itself are retired in #76.
 */
export default function ReelsPage() {
  redirect("/feed");
}
