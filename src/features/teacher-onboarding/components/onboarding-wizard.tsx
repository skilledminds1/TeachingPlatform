"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  GraduationCap,
  UserRound,
  Video,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { saveTeacherOnboarding } from "@/actions/teacher-onboarding";
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
import {
  countWords,
  teacherOnboardingSchema,
  type TeacherOnboardingInput,
} from "@/lib/validations/teacher-onboarding";
import { TIMEZONE_OPTIONS } from "@/lib/timezone";
import { LanguageEditor } from "./language-editor";
import { LESSON_CURRENCIES, currencySymbol } from "@/lib/currencies";
import { cn } from "@/lib/utils";

import { AvatarUploader } from "./avatar-uploader";
import { IntroVideoUploader } from "./intro-video-uploader";
import { QualificationFields } from "./qualification-fields";
import { SubjectSelect } from "./subject-select";
import { SubjectSpecialtyFields } from "./subject-specialty-fields";

interface SubjectOption {
  id: string;
  name: string;
  slug: string;
}

const steps = [
  { title: "About you", icon: UserRound },
  { title: "Your profile", icon: FileText },
  { title: "Teaching", icon: GraduationCap },
  { title: "Video", icon: Video },
  { title: "Review", icon: CheckCircle2 },
] as const;

const stepFields: Array<Array<keyof TeacherOnboardingInput>> = [
  ["name", "timezone", "languages", "avatarUrl"],
  ["headline", "bio", "qualifications"],
  ["hourlyRate", "currency", "subjectIds"],
  ["introVideoUrl", "introVideoPath"],
  [],
];

export function OnboardingWizard({
  subjects,
  organizationName,
  defaultValues,
  mode = "onboarding",
}: {
  subjects: SubjectOption[];
  organizationName: string;
  defaultValues: TeacherOnboardingInput;
  mode?: "onboarding" | "edit";
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [isPending, startTransition] = useTransition();
  const form = useForm<TeacherOnboardingInput>({
    resolver: zodResolver(teacherOnboardingSchema),
    defaultValues,
  });

  const name = useWatch({ control: form.control, name: "name" });
  const avatarUrl = useWatch({ control: form.control, name: "avatarUrl" });
  const introVideoUrl = useWatch({ control: form.control, name: "introVideoUrl" });
  const introVideoPath = useWatch({ control: form.control, name: "introVideoPath" });
  const bio = useWatch({ control: form.control, name: "bio" });
  const headline = useWatch({ control: form.control, name: "headline" });
  const hourlyRate = useWatch({ control: form.control, name: "hourlyRate" });
  const currency = useWatch({ control: form.control, name: "currency" }) ?? "USD";
  const watchedLanguages = useWatch({ control: form.control, name: "languages" }) ?? [];
  const selectedSubjects =
    useWatch({ control: form.control, name: "subjectIds" }) ?? [];
  const subjectSpecialties =
    useWatch({ control: form.control, name: "subjectSpecialties" }) ?? {};
  const qualifications =
    useWatch({ control: form.control, name: "qualifications" }) ?? [];
  const bioWords = countWords(bio ?? "");

  function updateSubjects(ids: string[]): void {
    const nextSpecialties = { ...subjectSpecialties };
    for (const subjectId of Object.keys(nextSpecialties)) {
      if (!ids.includes(subjectId)) delete nextSpecialties[subjectId];
    }
    form.setValue("subjectIds", ids, { shouldDirty: true, shouldValidate: true });
    form.setValue("subjectSpecialties", nextSpecialties, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  async function nextStep(): Promise<void> {
    const fields = stepFields[step];
    if (step === 3) {
      const url = form.getValues("introVideoUrl");
      const path = form.getValues("introVideoPath");
      if (!url || !path) {
        form.setError("introVideoUrl", {
          type: "manual",
          message: "Upload an introduction video",
        });
        toast.error("Upload an introduction video to continue.");
        return;
      }
    }
    const valid = await form.trigger(fields, { shouldFocus: true });
    if (valid) setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  function onSubmit(values: TeacherOnboardingInput): void {
    startTransition(async () => {
      const result = await saveTeacherOnboarding(values);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(
        mode === "edit" ? "Your profile has been updated." : "Your teacher profile has been saved.",
      );
      router.push("/dashboard/teacher");
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <ol className="grid grid-cols-5 gap-2" aria-label="Onboarding progress">
        {steps.map((item, index) => (
          <li key={item.title} className="space-y-2">
            <div
              className={cn(
                "h-1.5 rounded-full transition-colors",
                index <= step ? "bg-primary" : "bg-muted",
              )}
            />
            <div
              className={cn(
                "flex items-center gap-2 text-xs font-medium",
                index <= step ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <item.icon className="hidden size-3.5 sm:block" aria-hidden />
              <span className="truncate">{item.title}</span>
            </div>
          </li>
        ))}
      </ol>

      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <div className="min-h-[440px] rounded-xl border border-border bg-card p-6 shadow-sm md:p-8">
          {step === 0 ? (
            <div className="space-y-8">
              <div>
                <h2 className="text-xl font-semibold">Tell students who you are</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This information appears on your public teacher profile.
                </p>
              </div>
              <FieldGroup>
                <Field data-invalid={!!form.formState.errors.avatarUrl || undefined}>
                  <FieldLabel>Profile photo</FieldLabel>
                  <AvatarUploader
                    avatarUrl={avatarUrl}
                    name={name}
                    onUploaded={(url) =>
                      form.setValue("avatarUrl", url, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                  />
                  <input type="hidden" {...form.register("avatarUrl")} />
                  <FieldError errors={[form.formState.errors.avatarUrl]} />
                </Field>
                <Field data-invalid={!!form.formState.errors.name || undefined}>
                  <FieldLabel htmlFor="name">Full name</FieldLabel>
                  <Input
                    id="name"
                    autoComplete="name"
                    aria-invalid={!!form.formState.errors.name}
                    {...form.register("name")}
                  />
                  <FieldError errors={[form.formState.errors.name]} />
                </Field>
                <Field data-invalid={!!form.formState.errors.timezone || undefined}>
                  <FieldLabel htmlFor="timezone">Timezone</FieldLabel>
                  <select
                    id="timezone"
                    className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    aria-invalid={!!form.formState.errors.timezone}
                    {...form.register("timezone")}
                  >
                    {TIMEZONE_OPTIONS.map((zone) => (
                      <option key={zone.value} value={zone.value}>
                        {zone.label}
                      </option>
                    ))}
                  </select>
                  <FieldDescription>
                    Lesson times are shown to students in their own timezone.
                  </FieldDescription>
                  <FieldError errors={[form.formState.errors.timezone]} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="languages">Languages you teach in</FieldLabel>
                  <LanguageEditor
                    value={watchedLanguages}
                    onChange={(next) =>
                      form.setValue("languages", next, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                    error={form.formState.errors.languages?.message}
                  />
                  <FieldDescription>
                    Students filter by language first — list every language you can
                    genuinely teach in.
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-8">
              <div>
                <h2 className="text-xl font-semibold">Create a profile that stands out</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Explain your experience, approach, and what students can expect.
                </p>
              </div>
              <FieldGroup>
                <Field data-invalid={!!form.formState.errors.headline || undefined}>
                  <FieldLabel htmlFor="headline">Profile headline</FieldLabel>
                  <Input
                    id="headline"
                    placeholder="Qualified maths tutor helping students build confidence"
                    maxLength={120}
                    aria-invalid={!!form.formState.errors.headline}
                    {...form.register("headline")}
                  />
                  <FieldDescription>{headline?.length ?? 0}/120 characters</FieldDescription>
                  <FieldError errors={[form.formState.errors.headline]} />
                </Field>
                <Field data-invalid={!!form.formState.errors.bio || undefined}>
                  <FieldLabel htmlFor="bio">About you</FieldLabel>
                  <Textarea
                    id="bio"
                    className="min-h-52"
                    placeholder="Describe your qualifications, teaching experience, lesson style, and the students you help..."
                    aria-invalid={!!form.formState.errors.bio}
                    {...form.register("bio")}
                  />
                  <FieldDescription
                    className={bioWords >= 100 ? "text-emerald-500" : undefined}
                  >
                    {bioWords}/100 words minimum
                  </FieldDescription>
                  <FieldError errors={[form.formState.errors.bio]} />
                </Field>
                <QualificationFields form={form} />
              </FieldGroup>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-8">
              <div>
                <h2 className="text-xl font-semibold">Set up your teaching offer</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Select what you teach and choose your hourly lesson rate.
                </p>
              </div>
              <FieldGroup>
                <Field data-invalid={!!form.formState.errors.subjectIds || undefined}>
                  <FieldLabel>Subjects</FieldLabel>
                  <FieldDescription>
                    Add up to 3 subjects from the list. You can remove any selection below.
                  </FieldDescription>
                  <SubjectSelect
                    subjects={subjects}
                    selectedIds={selectedSubjects}
                    onChange={updateSubjects}
                  />
                  <FieldError errors={[form.formState.errors.subjectIds]} />
                </Field>
                <SubjectSpecialtyFields
                  subjects={subjects}
                  selectedIds={selectedSubjects}
                  specialtiesBySubjectId={subjectSpecialties}
                  onChange={(next) =>
                    form.setValue("subjectSpecialties", next, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                />
                <Field data-invalid={!!form.formState.errors.hourlyRate || undefined}>
                  <FieldLabel htmlFor="hourlyRate">Hourly lesson rate</FieldLabel>
                  <div className="relative max-w-xs">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                      {currencySymbol(currency)}
                    </span>
                    <Input
                      id="hourlyRate"
                      inputMode="decimal"
                      className="pl-8"
                      placeholder="25"
                      aria-invalid={!!form.formState.errors.hourlyRate}
                      {...form.register("hourlyRate")}
                    />
                  </div>
                  <FieldDescription>
                    Students pay you directly in your chosen currency. Amazing Skills does not
                    deduct commission.
                  </FieldDescription>
                  <FieldError errors={[form.formState.errors.hourlyRate]} />
                </Field>
                <Field data-invalid={!!form.formState.errors.currency || undefined}>
                  <FieldLabel htmlFor="currency">Lesson currency</FieldLabel>
                  <select
                    id="currency"
                    className="h-9 w-full max-w-xs rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    aria-invalid={!!form.formState.errors.currency}
                    {...form.register("currency")}
                  >
                    {LESSON_CURRENCIES.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <FieldDescription>
                    Students pay you via PayPal in this currency once your account is linked.
                  </FieldDescription>
                  <FieldError errors={[form.formState.errors.currency]} />
                </Field>
              </FieldGroup>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-8">
              <div>
                <h2 className="text-xl font-semibold">Record your introduction video</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Introduce yourself in a landscape video between 30 seconds and 2 minutes.
                </p>
              </div>
              <Field
                data-invalid={
                  !!form.formState.errors.introVideoUrl ||
                  !!form.formState.errors.introVideoPath ||
                  undefined
                }
              >
                <IntroVideoUploader
                  introVideoUrl={introVideoUrl ?? ""}
                  introVideoPath={introVideoPath ?? ""}
                  onUploaded={({ introVideoUrl: url, introVideoPath: path }) => {
                    form.clearErrors("introVideoUrl");
                    form.setValue("introVideoUrl", url, {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                    form.setValue("introVideoPath", path, {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                  }}
                  onRemoved={() => {
                    form.setValue("introVideoUrl", "", {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                    form.setValue("introVideoPath", "", {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                  }}
                />
                <input type="hidden" {...form.register("introVideoUrl")} />
                <input type="hidden" {...form.register("introVideoPath")} />
                <FieldError
                  errors={[
                    form.formState.errors.introVideoUrl,
                    form.formState.errors.introVideoPath,
                  ]}
                />
              </Field>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-8">
              <div>
                <h2 className="text-xl font-semibold">Review your teacher profile</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  You can edit this draft later before submitting it for approval.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <ReviewItem label="Name" value={name} />
                <ReviewItem label="Organization" value={organizationName} />
                <ReviewItem label="Headline" value={headline} />
                <ReviewItem
                  label="Hourly rate"
                  value={`${currencySymbol(currency)}${hourlyRate}/hour (${currency})`}
                />
                <ReviewItem
                  label="Subjects"
                  value={subjects
                    .filter((subject) => selectedSubjects.includes(subject.id))
                    .map((subject) => {
                      const details = subjectSpecialties[subject.id] ?? [];
                      return details.length > 0
                        ? `${subject.name} (${details.join(", ")})`
                        : subject.name;
                    })
                    .join("; ")}
                />
                <ReviewItem label="Biography" value={`${bioWords} words`} />
                <ReviewItem
                  label="Qualifications"
                  value={`${qualifications.length} added`}
                />
                <ReviewItem
                  label="Introduction video"
                  value={introVideoUrl ? "Uploaded" : "Missing"}
                />
              </div>
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
                <p className="font-medium">
                  {mode === "edit" ? "Ready to update?" : "What happens next?"}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {mode === "edit"
                    ? "Your changes will update your public teacher profile, lesson price, subjects, and qualifications."
                    : "We'll save your profile as a draft. Link a payment account and choose a marketplace plan from your dashboard before submitting it for admin approval."}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            disabled={step === 0 || isPending}
            onClick={() => setStep((current) => Math.max(0, current - 1))}
          >
            <ChevronLeft className="size-4" aria-hidden />
            Back
          </Button>
          {step < steps.length - 1 ? (
            <Button type="button" onClick={nextStep}>
              Continue
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          ) : (
            <Button type="submit" disabled={isPending}>
              {isPending
                ? "Saving profile…"
                : mode === "edit"
                  ? "Save profile changes"
                  : "Finish onboarding"}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value || "Not provided"}</p>
    </div>
  );
}
