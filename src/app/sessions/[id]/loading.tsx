import { Skeleton } from "@/components/ui/skeleton";

export default function VideoSessionLoading() {
  return (
    <main id="main-content" className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-[70vh] min-h-[520px] w-full rounded-xl" />
    </main>
  );
}
