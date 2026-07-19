"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { createCourse } from "@/actions/courses";
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
import { LESSON_CURRENCIES, currencySymbol } from "@/lib/currencies";
import {
  courseCurrencySchema,
  courseLevelSchema,
} from "@/lib/validations/courses";

const createCourseFormSchema = z.object({
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

type CreateCourseFormValues = z.infer<typeof createCourseFormSchema>;

const selectClassName =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function CourseCreateForm({
  subjects,
}: {
  subjects: Array<{ id: string; name: string; slug: string }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<CreateCourseFormValues>({
    resolver: zodResolver(createCourseFormSchema),
    defaultValues: {
      title: "",
      description: "",
      subjectId: "",
      price: "0",
      currency: "USD",
      level: "all_levels",
    },
  });

  const currency = useWatch({ control: form.control, name: "currency" }) ?? "USD";

  function onSubmit(values: CreateCourseFormValues): void {
    setFormError(null);
    startTransition(async () => {
      const result = await createCourse({
        title: values.title,
        description: values.description,
        subjectId: values.subjectId || null,
        priceCents: Math.round(Number(values.price) * 100),
        currency: values.currency,
        level: values.level,
      });
      if (!result.success) {
        setFormError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Course created.");
      router.push(`/dashboard/teacher/courses/${result.data.courseId}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <FieldGroup>
        <Field data-invalid={!!form.formState.errors.title || undefined}>
          <FieldLabel htmlFor="title">Title</FieldLabel>
          <Input
            id="title"
            placeholder="e.g. Beginner Spanish Conversation"
            aria-invalid={!!form.formState.errors.title}
            {...form.register("title")}
          />
          <FieldError errors={[form.formState.errors.title]} />
        </Field>

        <Field data-invalid={!!form.formState.errors.description || undefined}>
          <FieldLabel htmlFor="description">Description</FieldLabel>
          <Textarea
            id="description"
            placeholder="What will students learn?"
            aria-invalid={!!form.formState.errors.description}
            {...form.register("description")}
          />
          <FieldError errors={[form.formState.errors.description]} />
        </Field>

        <Field data-invalid={!!form.formState.errors.subjectId || undefined}>
          <FieldLabel htmlFor="subjectId">Subject</FieldLabel>
          <select
            id="subjectId"
            className={selectClassName}
            aria-invalid={!!form.formState.errors.subjectId}
            {...form.register("subjectId")}
          >
            <option value="">No subject</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
          <FieldError errors={[form.formState.errors.subjectId]} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field data-invalid={!!form.formState.errors.price || undefined}>
            <FieldLabel htmlFor="price">Price</FieldLabel>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                {currencySymbol(currency)}
              </span>
              <Input
                id="price"
                inputMode="decimal"
                className="pl-8"
                placeholder="49"
                aria-invalid={!!form.formState.errors.price}
                {...form.register("price")}
              />
            </div>
            <FieldDescription>Enter 0 for a free course.</FieldDescription>
            <FieldError errors={[form.formState.errors.price]} />
          </Field>

          <Field data-invalid={!!form.formState.errors.currency || undefined}>
            <FieldLabel htmlFor="currency">Currency</FieldLabel>
            <select
              id="currency"
              className={selectClassName}
              aria-invalid={!!form.formState.errors.currency}
              {...form.register("currency")}
            >
              {LESSON_CURRENCIES.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.code}
                </option>
              ))}
            </select>
            <FieldError errors={[form.formState.errors.currency]} />
          </Field>

          <Field data-invalid={!!form.formState.errors.level || undefined}>
            <FieldLabel htmlFor="level">Level</FieldLabel>
            <select
              id="level"
              className={selectClassName}
              aria-invalid={!!form.formState.errors.level}
              {...form.register("level")}
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
              <option value="all_levels">All levels</option>
            </select>
            <FieldError errors={[form.formState.errors.level]} />
          </Field>
        </div>
      </FieldGroup>

      {formError ? (
        <p className="text-sm text-destructive" role="alert">
          {formError}
        </p>
      ) : null}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Creating…" : "Create course"}
      </Button>
    </form>
  );
}
