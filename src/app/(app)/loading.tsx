import { Skeleton } from "@/components/ui/spinner";

export default function AppLoading() {
  return (
    <div className="flex flex-col gap-6 pt-2" aria-busy>
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
