"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useIsNativeApp } from "@/lib/capacitor/platform";

/**
 * Mobile-only sign-in gate (#149). On the **native** app a fresh launch should
 * open to the sign-in screen, not the anonymous map - the web keeps its
 * browse-first front door (#116). This redirects a signed-out native user from
 * any public surface to `/sign-in`, preserving where they were headed.
 *
 * Renders nothing and is a no-op on the web (the redirect only fires when
 * Capacitor reports a native platform), so the web experience is unchanged.
 */
export function MobileAuthGate({ signedIn }: { signedIn: boolean }) {
  const isNative = useIsNativeApp();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isNative || signedIn) return;
    const next = pathname && pathname !== "/" ? pathname : "/map";
    router.replace(`/sign-in?next=${encodeURIComponent(next)}`);
  }, [isNative, signedIn, pathname, router]);

  return null;
}
