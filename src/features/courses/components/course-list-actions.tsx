"use client";

import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { removeCourse } from "@/actions/courses";
import { Button } from "@/components/ui/button";

export function CourseListActions({
  courseId,
  courseTitle,
  canRemove,
}: {
  courseId: string;
  courseTitle: string;
  canRemove: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleRemove(): void {
    if (
      !window.confirm(
        `Remove "${courseTitle}"? This cannot be undone.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await removeCourse({ courseId });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Course removed.");
      router.refresh();
    });
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        render={<Link href={`/dashboard/teacher/courses/${courseId}`} />}
      >
        <Pencil aria-hidden />
        Edit
      </Button>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={isPending || !canRemove}
        title={canRemove ? "Remove course" : "Courses with students cannot be removed"}
        onClick={handleRemove}
      >
        <Trash2 aria-hidden />
        {isPending ? "Removing..." : "Remove"}
      </Button>
    </div>
  );
}
