import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BottomTabs } from "@/components/app/bottom-tabs";
import { OfflineBanner } from "@/components/app/offline-banner";
import { SideRail } from "@/components/app/side-rail";
import { SoundBoot } from "@/components/app/sound-boot";
import { AuthGateProvider } from "@/components/auth/auth-gate";
import { MobileAuthGate } from "@/components/auth/mobile-auth-gate";
import { PushRegistrar } from "@/components/push-registrar";

/**
 * The public app shell: the map and place pages render for everyone, signed in
 * or not, so a shared link always resolves. Unlike (shell), this never calls
 * requireOnboarded() - an anonymous explorer gets the same chrome with a
 * sign-in card, and walled actions push them to sign-in. Personalized pages
 * stay under (shell)'s gate.
 *
 * The front door itself is now sign-in (see (marketing)/page.tsx); these pages
 * remain reachable by direct link from search, shares and "look around first".
 */
export default async function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const profile = await getProfile(); // null when signed out - never redirects
  const signedIn = !!profile;

  let cityName = "Delhi NCR";
  if (profile?.home_city) {
    const supabase = await createClient();
    const { data: city } = await supabase
      .from("cities")
      .select("name")
      .eq("slug", profile.home_city)
      .maybeSingle();
    cityName =
      city?.name ??
      profile.home_city.charAt(0).toUpperCase() + profile.home_city.slice(1);
  }

  return (
    <AuthGateProvider signedIn={signedIn}>
      {/* Native app opens to /sign-in when signed out; no-op on web (#149). */}
      <MobileAuthGate signedIn={signedIn} />
      {/* Native push registration once signed in; no-op on web (#143/#125). */}
      <PushRegistrar signedIn={signedIn} />
      <OfflineBanner />
      <SoundBoot />
      <div className="min-h-dvh lg:pl-[var(--rail-w)]">{children}</div>
      <SideRail
        signedIn={signedIn}
        username={profile?.username ?? null}
        outsiderNumber={profile?.outsider_number ?? null}
        cityName={cityName}
      />
      <BottomTabs signedIn={signedIn} />
    </AuthGateProvider>
  );
}
