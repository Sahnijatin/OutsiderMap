"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { FollowState } from "@/lib/feed/follows";
import type { PostCard as PostCardData } from "@/lib/feed/read";
import { PostCard } from "../../feed/post-card";
import { SafetyMenu } from "./safety-menu";

type FriendStatus = "self" | "none" | "pending_out" | "pending_in" | "accepted";

type ProfilePayload = {
  profile: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    outsider_number: number | null;
  };
  follow: FollowState;
  friendStatus: FriendStatus;
  friendshipId: string | null;
  isSelf: boolean;
  posts: PostCardData[];
};

export function ProfileView({ username }: { username: string }) {
  const [data, setData] = useState<ProfilePayload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "notfound" | "error">("loading");
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    (async () => {
      try {
        const res = await fetch(`/api/profile/${encodeURIComponent(username)}`);
        if (res.status === 404) {
          setStatus("notfound");
          return;
        }
        if (!res.ok) throw new Error();
        setData((await res.json()) as ProfilePayload);
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    })();
  }, [username]);

  if (status === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }
  if (status === "notfound") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-2 px-5 text-center">
        <p className="font-display text-lg text-ink">No outsider here</p>
        <p className="text-sm text-ink-dim">@{username} isn&apos;t someone we know.</p>
        <Link href="/feed" className="mt-2 text-sm text-accent hover:underline">
          Back to feed
        </Link>
      </main>
    );
  }
  if (status === "error" || !data) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl items-center justify-center px-5">
        <p className="text-sm text-danger">Couldn&apos;t load this profile.</p>
      </main>
    );
  }

  const { profile, posts } = data;
  const name = profile.display_name ?? (profile.username ? `@${profile.username}` : "An outsider");

  return (
    <main className="mx-auto min-h-dvh max-w-xl px-4 pb-28 pt-4">
      <Link
        href="/feed"
        className="mb-3 inline-flex items-center gap-1 text-sm text-ink-dim hover:text-ink"
      >
        <ChevronLeft className="size-4" />
        Feed
      </Link>

      <header className="flex items-center gap-4 py-2">
        <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-raise text-xl text-ink-dim">
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatar_url} alt="" className="size-full object-cover" />
          ) : (
            name.replace("@", "").charAt(0).toUpperCase()
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-xl text-ink">{name}</h1>
          <p className="text-sm text-ink-dim">
            {profile.username ? `@${profile.username}` : ""}
            {profile.outsider_number != null && (
              <span className="ml-1.5 font-mono text-xs">#{profile.outsider_number}</span>
            )}
          </p>
          <p className="mt-1 text-xs text-ink-dim">
            <span className="text-ink">{data.follow.followerCount}</span> followers ·{" "}
            <span className="text-ink">{data.follow.followingCount}</span> following
            {data.follow.followsYou && !data.isSelf && (
              <span className="ml-2 rounded-full bg-raise px-2 py-0.5 text-[0.65rem] text-ink-dim">
                Follows you
              </span>
            )}
          </p>
        </div>
      </header>

      {!data.isSelf && (
        <ProfileActions
          targetId={profile.id}
          username={profile.username}
          initial={data}
        />
      )}

      <div className="mt-6 flex flex-col gap-4">
        {posts.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-dim">
            {data.isSelf ? "You haven't posted yet." : "Nothing to show you here yet."}
          </p>
        ) : (
          posts.map((post) => <PostCard key={post.id} post={post} />)
        )}
      </div>
    </main>
  );
}

function ProfileActions({
  targetId,
  username,
  initial,
}: {
  targetId: string;
  username: string | null;
  initial: ProfilePayload;
}) {
  const [following, setFollowing] = useState(initial.follow.isFollowing);
  const [friend, setFriend] = useState<FriendStatus>(initial.friendStatus);
  const [friendshipId, setFriendshipId] = useState(initial.friendshipId);
  const [busy, setBusy] = useState(false);

  async function toggleFollow() {
    if (busy) return;
    setBusy(true);
    const prev = following;
    setFollowing(!prev);
    try {
      const res = await fetch(`/api/follows/${targetId}`, {
        method: prev ? "DELETE" : "POST",
      });
      if (!res.ok) throw new Error();
    } catch {
      setFollowing(prev);
    } finally {
      setBusy(false);
    }
  }

  async function addFriend() {
    if (busy || !username) return;
    setBusy(true);
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      if (res.ok) setFriend("pending_out");
    } catch {
      // leave state; the button can be retried
    } finally {
      setBusy(false);
    }
  }

  async function acceptFriend() {
    if (busy || !friendshipId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/friends", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: friendshipId }),
      });
      if (res.ok) {
        setFriend("accepted");
        setFriendshipId(friendshipId);
      }
    } catch {
      // retryable
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant={following ? "secondary" : "primary"}
        size="sm"
        onClick={toggleFollow}
        disabled={busy}
      >
        {following ? "Following" : "Follow"}
      </Button>

      {friend === "none" && (
        <Button variant="secondary" size="sm" onClick={addFriend} disabled={busy}>
          Add friend
        </Button>
      )}
      {friend === "pending_out" && (
        <Button variant="ghost" size="sm" disabled>
          Requested
        </Button>
      )}
      {friend === "pending_in" && (
        <Button variant="secondary" size="sm" onClick={acceptFriend} disabled={busy}>
          Accept friend
        </Button>
      )}
      {friend === "accepted" && (
        <Button variant="ghost" size="sm" disabled>
          Friends
        </Button>
      )}

      <div className="ml-auto">
        <SafetyMenu targetId={targetId} username={username} />
      </div>
    </div>
  );
}
