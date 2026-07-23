import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BottomTabs } from "@/components/app/bottom-tabs";
import { SideRail } from "@/components/app/side-rail";

/**
 * The public app shell (#116): the map and place pages render for everyone,
 * signed in or not. Unlike (shell), this never calls requireOnboarded() — an
 * anonymous explorer gets the same chrome with a sign-in card, and walled
 * actions push them to sign-in. Personalized pages stay under (shell)'s gate.
 */
export default async function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const profile = await getProfile(); // null when signed out — never redirects
  const signedIn = !!profile;

  let cityName = "Delhi";
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
    <>
      <div className="min-h-dvh lg:pl-[var(--rail-w)]">{children}</div>
      <SideRail
        signedIn={signedIn}
        username={profile?.username ?? null}
        outsiderNumber={profile?.outsider_number ?? null}
        cityName={cityName}
      />
      <BottomTabs signedIn={signedIn} />
    </>
  );
}
