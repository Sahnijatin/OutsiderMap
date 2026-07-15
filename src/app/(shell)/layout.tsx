import { requireOnboarded } from "@/lib/auth";
import { BottomTabs } from "@/components/app/bottom-tabs";

/**
 * The new app shell: full-bleed surfaces (map-first) with a phone-style
 * bottom tab bar. Legacy surfaces under (app) keep their top nav until they
 * migrate here sprint by sprint.
 */
export default async function ShellLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireOnboarded();

  return (
    <>
      <div className="min-h-dvh">{children}</div>
      <BottomTabs />
    </>
  );
}
