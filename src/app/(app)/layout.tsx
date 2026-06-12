import { requireOnboarded } from "@/lib/auth";
import { AppNav } from "@/components/app/nav";

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
      <div className="mx-auto w-full max-w-5xl px-6 pb-24 pt-24">
        {children}
      </div>
    </>
  );
}
