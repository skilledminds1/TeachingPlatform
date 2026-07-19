"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { CourseLevel, CourseStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import {
  archiveCourse,
  publishCourse,
  unpublishCourse,
  updateCourse,
  uploadCourseCover,
} from "@/actions/courses";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/features/admin/components/status-badge";
import { courseStatusTone, formatCourseLevel } from "@/features/courses/lib/labels";
import { LESSON_CURRENCIES, currencySymbol } from "@/lib/currencies";
import { formatStatus } from "@/lib/format";
import {
  courseCurrencySchema,
  courseLevelSchema,
} from "@/lib/validations/courses";

const editCourseFormSchema = z.object({
  title: z.string().trim().min(2, "Enter a course title").max(150),
  description: z.string().trim().max(10_000),
  subjectId: z.string().optional(),
  price: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, "Enter a valid price")
    .refine((value) => Number(value) >= 0, "Price cannot be negative"),
  currency: courseCurrencySchema,
  level: courseLevelSchema,
});

type EditCourseFormValues = z.infer<typeof editCourseFormSchema>;

const selectClassName =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function CourseEditForm({
  course,
  subjects,
}: {
  course: {
    id: string;
    slug: string;
    title: string;
    description: string;
    coverImageUrl: string | null;
    priceCents: number;
    currency: string;
    level: CourseLevel;
    status: CourseStatus;
    subjectId: string | null;
  };
  subjects: Array<{ id: string; name: string; slug: string }>;
}) {
  const router = useRouter();
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [coverUrl, setCoverUrl] = useState(course.coverImageUrl);
  const form = useForm<EditCourseFormValues>({
    resolver: zodResolver(editCourseFormSchema),
    defaultValues: {
      title: course.title,
      description: course.description,
      subjectId: course.subjectId ?? "",
      price: (course.priceCents / 100).toFixed(course.priceCents % 100 === 0 ? 0 : 2),
      currency: course.currency as EditCourseFormValues["currency"],
      level: course.level,
    },
  });

  const currency = useWatch({ control: form.control, name: "currency" }) ?? course.currency;

  function onSubmit(values: EditCourseFormValues): void {
    startTransition(async () => {
      const result = await updateCourse({
        courseId: course.id,
        title: values.title,
        description: values.description,
        subjectId: values.subjectId || null,
        priceCents: Math.round(Number(values.price) * 100),
        currency: values.currency,
        level: values.level,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Course updated.");
      router.refresh();
    });
  }

  function runStatusAction(
    action: () => Promise<{ success: boolean; error?: string }>,
    successMessage: string,
  ): void {
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        toast.error(result.error ?? "Something went wrong.");
        return;
      }
      toast.success(successMessage);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Course settings</p>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">Details</h2>
            <StatusBadge tone={courseStatusTone(course.status)}>
              {formatStatus(course.status)}
            </StatusBadge>
            <span className="text-xs text-muted-foreground">
              {formatCourseLevel(course.level)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {course.status !== "published" ? (
            <Button
              type="button"
              disabled={isPending}
              onClick={() =>
                runStatusAction(
                  () => publishCourse({ courseId: course.id }),
                  "Course published.",
                )
              }
            >
              Publish
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() =>
                runStatusAction(
                  () => unpublishCourse({ courseId: course.id }),
                  "Course unpublished.",
                )
              }
            >
              Unpublish
            </Button>
          )}
          {course.status !== "archived" ? (
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() =>
                runStatusAction(
                  () => archiveCourse({ courseId: course.id }),
                  "Course archived.",
                )
              }
            >
              Archive
            </Button>
          ) : null}
          {course.status === "published" ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push(`/courses/${course.slug}`)}
            >
              View public page
            </Button>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm">
        <p className="text-sm font-medium">Cover image</p>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="aspect-[16/9] w-full max-w-xs overflow-hidden rounded-lg bg-muted">
            {coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverUrl} alt="" className="size-full object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
                No cover yet
              </div>
            )}
          </div>
          <div className="space-y-2">
            <input
              ref={coverInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                startTransition(async () => {
                  const formData = new FormData();
                  formData.set("courseId", course.id);
                  formData.set("cover", file);
                  const result = await uploadCourseCover(formData);
                  if (!result.success) {
                    toast.error(result.error);
                    return;
                  }
                  setCoverUrl(result.data.coverImageUrl);
                  toast.success("Cover updated.");
                  router.refresh();
                });
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => coverInputRef.current?.click()}
            >
              {isPending ? "Uploading…" : "Upload cover"}
            </Button>
            <FieldDescription>JPG, PNG, or WebP up to 5 MB.</FieldDescription>
          </div>
        </div>
      </div>

      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-6 rounded-xl border border-border bg-card p-5 shadow-sm"
        noValidate
      >
        <FieldGroup>
          <Field data-invalid={!!form.formState.errors.title || undefined}>
            <FieldLabel htmlFor="edit-title">Title</FieldLabel>
            <Input
              id="edit-title"
              aria-invalid={!!form.formState.errors.title}
              {...form.register("title")}
            />
            <FieldError errors={[form.formState.errors.title]} />
          </Field>

          <Field data-invalid={!!form.formState.errors.description || undefined}>
            <FieldLabel htmlFor="edit-description">Description</FieldLabel>
            <Textarea
              id="edit-description"
              aria-invalid={!!form.formState.errors.description}
              {...form.register("description")}
            />
            <FieldError errors={[form.formState.errors.description]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="edit-subject">Subject</FieldLabel>
            <select
              id="edit-subject"
              className={selectClassName}
              {...form.register("subjectId")}
            >
              <option value="">No subject</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field data-invalid={!!form.formState.errors.price || undefined}>
              <FieldLabel htmlFor="edit-price">Price</FieldLabel>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                  {currencySymbol(currency)}
                </span>
                <Input
                  id="edit-price"
                  inputMode="decimal"
                  className="pl-8"
                  aria-invalid={!!form.formState.errors.price}
                  {...form.register("price")}
                />
              </div>
              <FieldError errors={[form.formState.errors.price]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="edit-currency">Currency</FieldLabel>
              <select
                id="edit-currency"
                className={selectClassName}
                {...form.register("currency")}
              >
                {LESSON_CURRENCIES.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.code}
                  </option>
                ))}
              </select>
            </Field>

            <Field>
              <FieldLabel htmlFor="edit-level">Level</FieldLabel>
              <select id="edit-level" className={selectClassName} {...form.register("level")}>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
                <option value="all_levels">All levels</option>
              </select>
            </Field>
          </div>
        </FieldGroup>

        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save changes"}
        </Button>
      </form>
    </div>
  );
}
