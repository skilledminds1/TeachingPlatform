"use client";

import type { CourseLevel, CourseStatus } from "@prisma/client";
import {
  Award,
  BookOpen,
  CheckCircle2,
  Circle,
  CreditCard,
  FileText,
  ImageIcon,
  Send,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  archiveCourse,
  submitCourseForReview,
  unpublishCourse,
  updateCourse,
  uploadCourseCover,
} from "@/actions/courses";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/features/admin/components/status-badge";
import { CourseCurriculumEditor } from "@/features/courses/components/course-curriculum-editor";
import { courseStatusTone, formatCourseLevel } from "@/features/courses/lib/labels";
import { LESSON_CURRENCIES, currencySymbol } from "@/lib/currencies";
import { formatStatus } from "@/lib/format";
import { cn } from "@/lib/utils";

type Asset = {
  id: string;
  kind: "video" | "resource";
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sortOrder: number;
};

type Lesson = {
  id: string;
  title: string;
  content: string;
  videoUrl: string | null;
  fileName: string | null;
  sortOrder: number;
  isPreview: boolean;
  assets: Asset[];
};

type Module = {
  id: string;
  title: string;
  sortOrder: number;
  lessons: Lesson[];
};

const sections = [
  { id: "landing", label: "Landing page", icon: FileText },
  { id: "curriculum", label: "Curriculum", icon: BookOpen },
  { id: "pricing", label: "Pricing", icon: CreditCard },
  { id: "certificate", label: "Certificate", icon: Award },
  { id: "submit", label: "Submit for review", icon: Send },
] as const;

type SectionId = (typeof sections)[number]["id"];

const selectClassName =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function CourseStudio({
  course,
  subjects,
  readinessReasons,
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
    certificateEnabled: boolean;
    rejectionReason: string | null;
    modules: Module[];
  };
  subjects: Array<{ id: string; name: string; slug: string }>;
  readinessReasons: string[];
}) {
  const router = useRouter();
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [section, setSection] = useState<SectionId>("landing");
  const [isPending, startTransition] = useTransition();
  const [coverUrl, setCoverUrl] = useState(course.coverImageUrl);
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description);
  const [subjectId, setSubjectId] = useState(course.subjectId ?? "");
  const [level, setLevel] = useState(course.level);
  const [price, setPrice] = useState(
    (course.priceCents / 100).toFixed(course.priceCents % 100 === 0 ? 0 : 2),
  );
  const [currency, setCurrency] = useState(course.currency);
  const [certificateEnabled, setCertificateEnabled] = useState(course.certificateEnabled);

  const lessonCount = course.modules.reduce((sum, module) => sum + module.lessons.length, 0);

  function refresh(): void {
    router.refresh();
  }

  function saveLanding(): void {
    startTransition(async () => {
      const result = await updateCourse({
        courseId: course.id,
        title: title.trim(),
        description: description.trim(),
        subjectId: subjectId || null,
        level,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Landing page saved.");
      refresh();
    });
  }

  function savePricing(): void {
    startTransition(async () => {
      const result = await updateCourse({
        courseId: course.id,
        priceCents: Math.round(Number(price) * 100),
        currency: currency as (typeof LESSON_CURRENCIES)[number]["code"],
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Pricing saved.");
      refresh();
    });
  }

  function saveCertificate(): void {
    startTransition(async () => {
      const result = await updateCourse({
        courseId: course.id,
        certificateEnabled,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Certificate settings saved.");
      refresh();
    });
  }

  function runStatus(
    action: () => Promise<{ success: boolean; error?: string }>,
    message: string,
  ): void {
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        toast.error(result.error ?? "Something went wrong.");
        return;
      }
      toast.success(message);
      refresh();
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <aside className="space-y-4">
        <div className="space-y-2">
          <StatusBadge tone={courseStatusTone(course.status)}>
            {formatStatus(course.status)}
          </StatusBadge>
          <p className="text-xs text-muted-foreground">
            {formatCourseLevel(course.level)} · {lessonCount} lesson
            {lessonCount === 1 ? "" : "s"}
          </p>
        </div>
        <nav aria-label="Course studio sections">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {sections.map((item) => {
              const active = item.id === section;
              return (
                <li key={item.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setSection(item.id)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                      active
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    <item.icon className="size-4 shrink-0" aria-hidden />
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <div className="min-w-0 space-y-6">
        {course.status === "rejected" && course.rejectionReason ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
            <p className="font-medium text-destructive">Changes requested</p>
            <p className="mt-1 text-muted-foreground">{course.rejectionReason}</p>
          </div>
        ) : null}

        {course.status === "pending_approval" ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
            <p className="font-medium">Awaiting admin review</p>
            <p className="mt-1 text-muted-foreground">
              Your course is queued for approval before it appears in the marketplace.
            </p>
          </div>
        ) : null}

        {section === "landing" ? (
          <div className="space-y-6">
            <div>
              <h2 className="font-heading text-2xl font-semibold tracking-tight">
                Course landing page
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                This is what students see before they buy.
              </p>
            </div>

            <div className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm">
              <p className="text-sm font-medium">Cover image</p>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="aspect-video w-full max-w-sm overflow-hidden rounded-lg bg-muted">
                  {coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coverUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                      <ImageIcon className="size-5" aria-hidden />
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
                        refresh();
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

            <div className="space-y-5 rounded-xl border border-border bg-card p-5 shadow-sm">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="studio-title">Title</FieldLabel>
                  <Input
                    id="studio-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="studio-description">Description</FieldLabel>
                  <Textarea
                    id="studio-description"
                    className="min-h-40"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="What will students learn? Who is this for?"
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="studio-subject">Subject</FieldLabel>
                    <select
                      id="studio-subject"
                      className={selectClassName}
                      value={subjectId}
                      onChange={(event) => setSubjectId(event.target.value)}
                    >
                      <option value="">No subject</option>
                      {subjects.map((subject) => (
                        <option key={subject.id} value={subject.id}>
                          {subject.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="studio-level">Level</FieldLabel>
                    <select
                      id="studio-level"
                      className={selectClassName}
                      value={level}
                      onChange={(event) => setLevel(event.target.value as CourseLevel)}
                    >
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                      <option value="all_levels">All levels</option>
                    </select>
                  </Field>
                </div>
              </FieldGroup>
              <Button type="button" disabled={isPending} onClick={saveLanding}>
                {isPending ? "Saving…" : "Save landing page"}
              </Button>
            </div>
          </div>
        ) : null}

        {section === "curriculum" ? (
          <CourseCurriculumEditor courseId={course.id} modules={course.modules} />
        ) : null}

        {section === "pricing" ? (
          <div className="space-y-6">
            <div>
              <h2 className="font-heading text-2xl font-semibold tracking-tight">Pricing</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Students pay you directly. Enter 0 for a free course.
              </p>
            </div>
            <div className="max-w-md space-y-5 rounded-xl border border-border bg-card p-5 shadow-sm">
              <Field>
                <FieldLabel htmlFor="studio-price">Price</FieldLabel>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                    {currencySymbol(currency)}
                  </span>
                  <Input
                    id="studio-price"
                    inputMode="decimal"
                    className="pl-8"
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                  />
                </div>
              </Field>
              <Field>
                <FieldLabel htmlFor="studio-currency">Currency</FieldLabel>
                <select
                  id="studio-currency"
                  className={selectClassName}
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value)}
                >
                  {LESSON_CURRENCIES.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Button type="button" disabled={isPending} onClick={savePricing}>
                {isPending ? "Saving…" : "Save pricing"}
              </Button>
            </div>
          </div>
        ) : null}

        {section === "certificate" ? (
          <div className="space-y-6">
            <div>
              <h2 className="font-heading text-2xl font-semibold tracking-tight">
                Certificate of completion
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Optional. When enabled, students automatically receive a certificate after
                completing every lesson.
              </p>
            </div>
            <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 size-4 rounded border-border"
                  checked={certificateEnabled}
                  onChange={(event) => setCertificateEnabled(event.target.checked)}
                />
                <span>
                  <span className="font-medium">Offer a certificate of completion</span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    Includes the student name, course title, teacher name, issue date, and a
                    public verification code.
                  </span>
                </span>
              </label>
              <Button type="button" disabled={isPending} onClick={saveCertificate}>
                {isPending ? "Saving…" : "Save certificate settings"}
              </Button>
            </div>
          </div>
        ) : null}

        {section === "submit" ? (
          <div className="space-y-6">
            <div>
              <h2 className="font-heading text-2xl font-semibold tracking-tight">
                Submit for review
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                An admin must approve your course before it appears on the Courses marketplace.
                Existing students keep access if you edit a published course.
              </p>
            </div>

            <ul className="space-y-2 rounded-xl border border-border bg-card p-5 shadow-sm">
              {(readinessReasons.length === 0
                ? ["Ready to submit for admin review."]
                : readinessReasons
              ).map((reason) => (
                <li key={reason} className="flex items-start gap-2 text-sm">
                  {readinessReasons.length === 0 ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                  ) : (
                    <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className={readinessReasons.length === 0 ? "font-medium" : "text-muted-foreground"}>
                    {reason}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap gap-2">
              {course.status !== "pending_approval" && course.status !== "archived" ? (
                <Button
                  type="button"
                  disabled={isPending || readinessReasons.length > 0}
                  onClick={() =>
                    runStatus(
                      () => submitCourseForReview({ courseId: course.id }),
                      "Course submitted for review.",
                    )
                  }
                >
                  <Send className="size-4" aria-hidden />
                  Submit for review
                </Button>
              ) : null}
              {course.status === "published" ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isPending}
                    onClick={() =>
                      runStatus(
                        () => unpublishCourse({ courseId: course.id }),
                        "Course unpublished.",
                      )
                    }
                  >
                    Unpublish
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    render={<Link href={`/courses/${course.slug}`} />}
                  >
                    View public page
                  </Button>
                </>
              ) : null}
              {course.status !== "archived" ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => {
                    if (!window.confirm("Archive this course?")) return;
                    runStatus(
                      () => archiveCourse({ courseId: course.id }),
                      "Course archived.",
                    );
                  }}
                >
                  Archive
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
