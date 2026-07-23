"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { SignInPanel } from "@/components/auth/sign-in-panel";
import { safeNextPath } from "@/lib/auth/next-path";

function SignInFormInner() {
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));
  const urlError = searchParams.get("error");

  return (
    <SignInPanel
      next={next}
      initialError={
        urlError ? "That sign-in link didn’t work. Try again here." : null
      }
    />
  );
}

export function SignInForm() {
  return (
    <Suspense>
      <SignInFormInner />
    </Suspense>
  );
}
