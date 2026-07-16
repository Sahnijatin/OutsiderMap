import { requireOnboarded } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BottomTabs } from "@/components/app/bottom-tabs";
import { SideRail } from "@/components/app/side-rail";

/**
 * The app shell: full-bleed surfaces (map-first) with a phone-style bottom
 * tab bar on small screens and a fixed left rail on lg+. Content offsets
 * itself with --rail-w (0 on phones), so mobile markup never changes.
 */
export default async function ShellLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const profile = await requireOnboarded();

  const supabase = await createClient();
  const { data: city } = await supabase
    .from("cities")
    .select("name")
    .eq("slug", profile.home_city ?? "delhi")
    .maybeSingle();
  const cityName =
    city?.name ??
    (profile.home_city
      ? profile.home_city.charAt(0).toUpperCase() + profile.home_city.slice(1)
      : "Delhi");

  return (
    <>
      <div className="min-h-dvh lg:pl-[var(--rail-w)]">{children}</div>
      <SideRail
        username={profile.username}
        outsiderNumber={profile.outsider_number}
        cityName={cityName}
      />
      <BottomTabs />
    </>
  );
}
