import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/auth";
import { ProfileView } from "./profile-view";

export const metadata: Metadata = { title: "Profile" };

/** A member's public profile: identity, follow/friend, and their visible posts. */
export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  await requireOnboarded();
  const { username } = await params;
  return <ProfileView username={username} />;
}
