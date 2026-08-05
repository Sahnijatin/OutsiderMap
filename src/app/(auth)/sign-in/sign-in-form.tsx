"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { SignInPanel } from "@/components/auth/sign-in-panel";
import { callbackErrorCopy } from "@/lib/auth/auth-errors";
import { safeNextPath } from "@/lib/auth/next-path";

function SignInFormInner() {
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));
  const urlError = searchParams.get("error");

  return (
    <SignInPanel
      next={next}
      initialError={urlError ? callbackErrorCopy(urlError) : null}
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
