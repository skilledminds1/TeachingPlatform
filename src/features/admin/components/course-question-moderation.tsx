"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { setCourseQuestionHidden } from "@/actions/course-quality";
import { Button } from "@/components/ui/button";

export function CourseQuestionModeration({
  questionId,
  hidden,
}: {
  questionId: string;
  hidden: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await setCourseQuestionHidden({ questionId, hidden: !hidden });
          if (!result.success) {
            toast.error(result.error);
            return;
          }
          toast.success(hidden ? "Question restored." : "Question hidden.");
        })
      }
    >
      {hidden ? "Restore question" : "Hide question"}
    </Button>
  );
}
