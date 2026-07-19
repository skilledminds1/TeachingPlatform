"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { createCourse } from "@/actions/courses";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const createCourseTitleSchema = z.object({
  title: z.string().trim().min(2, "Enter a course title").max(150),
});

type CreateCourseTitleValues = z.infer<typeof createCourseTitleSchema>;

export function CourseCreateForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<CreateCourseTitleValues>({
    resolver: zodResolver(createCourseTitleSchema),
    defaultValues: { title: "" },
  });

  function onSubmit(values: CreateCourseTitleValues): void {
    setFormError(null);
    startTransition(async () => {
      const result = await createCourse({
        title: values.title,
        description: "",
        subjectId: null,
        priceCents: 0,
        currency: "USD",
        level: "all_levels",
      });
      if (!result.success) {
        setFormError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Course created. Continue building your curriculum.");
      router.push(`/dashboard/teacher/courses/${result.data.courseId}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <FieldGroup>
        <Field data-invalid={!!form.formState.errors.title || undefined}>
          <FieldLabel htmlFor="title">How about a working title?</FieldLabel>
          <Input
            id="title"
            placeholder="e.g. Beginner Spanish Conversation"
            aria-invalid={!!form.formState.errors.title}
            {...form.register("title")}
          />
          <FieldDescription>
            You can change this later. Next you&apos;ll add landing page details, curriculum,
            pricing, and media.
          </FieldDescription>
          <FieldError errors={[form.formState.errors.title]} />
        </Field>
      </FieldGroup>

      {formError ? (
        <p className="text-sm text-destructive" role="alert">
          {formError}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={isPending}>
        {isPending ? "Creating…" : "Continue"}
      </Button>
    </form>
  );
}
