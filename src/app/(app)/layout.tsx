import { requireOnboarded } from "@/lib/auth";
import { AppNav } from "@/components/app/nav";
import { BottomTabs } from "@/components/app/bottom-tabs";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const profile = await requireOnboarded();

  return (
    <>
      <AppNav
        displayName={profile.display_name}
        isAdmin={profile.is_admin}
      />
      {/* pb-40 clears both the page footer space and the bottom tab bar. */}
      <div className="mx-auto w-full max-w-5xl px-6 pb-40 pt-24">
        {children}
      </div>
      <BottomTabs />
    </>
  );
}
