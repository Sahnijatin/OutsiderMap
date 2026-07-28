"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { tap as hapticTap } from "@/lib/native/haptics";
import { playSound } from "@/lib/sound/engine";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Screen } from "@/components/app/screen";
import type { FollowState } from "@/lib/feed/follows";
import type { PostCard as PostCardData } from "@/lib/feed/read";
import { PostCard } from "../../feed/post-card";
import { SafetyMenu } from "./safety-menu";

type ProfilePayload = {
  profile: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    outsider_number: number | null;
    bio: string | null;
  };
  follow: FollowState;
  isSelf: boolean;
  posts: PostCardData[];
  contributions: Array<{ slug: string; name: string; area: string | null }>;
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
      <Screen
        width="narrow"
        className="flex flex-col items-center justify-center gap-2 text-center"
      >
        <p className="font-display text-lg text-ink">No outsider here</p>
        <p className="text-sm text-ink-dim">@{username} isn&apos;t someone we know.</p>
        <Link href="/feed" className="mt-2 text-sm text-accent hover:underline">
          Back to feed
        </Link>
      </Screen>
    );
  }
  if (status === "error" || !data) {
    return (
      <Screen
        width="narrow"
        className="flex items-center justify-center"
      >
        <p className="text-sm text-danger">Couldn&apos;t load this profile.</p>
      </Screen>
    );
  }

  const { profile, posts } = data;
  const name = profile.display_name ?? (profile.username ? `@${profile.username}` : "An outsider");

  return (
    <Screen width="narrow">
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

      {profile.bio && (
        <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink">
          {profile.bio}
        </p>
      )}

      {(data.contributions?.length ?? 0) > 0 && (
        <section className="mt-4">
          <p className="voice">on the map because of them</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {data.contributions.map((c) => (
              <Link
                key={c.slug}
                href={`/place/${encodeURIComponent(c.slug)}`}
                className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink transition-colors hover:border-accent/50"
              >
                {c.name}
                {c.area ? <span className="text-ink-dim"> · {c.area}</span> : null}
              </Link>
            ))}
          </div>
        </section>
      )}

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
    </Screen>
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
  const [busy, setBusy] = useState(false);

  async function toggleFollow() {
    if (busy) return;
    setBusy(true);
    const prev = following;
    setFollowing(!prev);
    if (!prev) {
      // Following someone is a deliberate moment; unfollowing stays quiet.
      playSound("tap");
      hapticTap();
    }
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

      <div className="ml-auto">
        <SafetyMenu targetId={targetId} username={username} />
      </div>
    </div>
  );
}
