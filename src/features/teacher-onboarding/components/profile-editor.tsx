"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronDown, Eye, GraduationCap, Share2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { saveTeacherOnboarding } from "@/actions/teacher-onboarding";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { StatusBadge, statusTone } from "@/features/admin/components/status-badge";
import { LESSON_CURRENCIES, currencySymbol } from "@/lib/currencies";
import { formatStatus } from "@/lib/format";
import { countryOptions } from "@/lib/countries";
import { TIMEZONE_OPTIONS } from "@/lib/timezone";
import { LanguageEditor } from "./language-editor";
import { cn } from "@/lib/utils";
import {
  countWords,
  teacherOnboardingSchema,
  type TeacherOnboardingInput,
} from "@/lib/validations/teacher-onboarding";

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

const sections = [
  { id: "about", label: "About" },
  { id: "photo", label: "Photo" },
  { id: "description", label: "Description" },
  { id: "video", label: "Video" },
  { id: "subjects", label: "Subjects" },
  { id: "pricing", label: "Pricing" },
  { id: "background", label: "Background" },
] as const;

type SectionId = (typeof sections)[number]["id"];

const sectionFields: Record<SectionId, Array<keyof TeacherOnboardingInput>> = {
  about: ["name", "timezone", "country", "languages"],
  photo: ["avatarUrl"],
  description: ["headline", "bio"],
  video: ["introVideoUrl", "introVideoPath"],
  subjects: ["subjectIds", "subjectSpecialties"],
  pricing: ["hourlyRate", "currency"],
  background: ["qualifications"],
};

const photoChecklist = [
  "You should be facing forward",
  "Frame your head and shoulders",
  "You should be centered and upright",
  "Your face and eyes should be visible (except for religious reasons)",
  "You should be the only person in the photo",
  "Use a color photo with high resolution and no filters",
  "Avoid logos or contact information",
];

const videoDos = [
  "Your video should be between 30 seconds and 2 minutes long",
  "Record in horizontal mode and at eye level",
  "Use good lighting and a neutral background",
  "Use a stable surface so that your video does not appear shaky",
  "Make sure your face and eyes are fully visible (except for religious reasons)",
  "Highlight your teaching experience and any relevant teaching certification(s)",
  "Greet your students warmly and invite them to book a lesson",
];

const videoDonts = [
  "Include your surname or any contact details",
  "Include logos or links",
  "Use slideshows or presentations",
  "Have any other people visible in your video",
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function ProfileEditor({
  subjects,
  defaultValues,
  profileStatus,
  profileSlug,
}: {
  subjects: SubjectOption[];
  defaultValues: TeacherOnboardingInput;
  profileStatus: string;
  profileSlug: string;
}) {
  const router = useRouter();
  const [section, setSection] = useState<SectionId>("about");
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
  const currency = useWatch({ control: form.control, name: "currency" }) ?? "USD";
  const watchedLanguages = useWatch({ control: form.control, name: "languages" }) ?? [];
  const selectedSubjects =
    useWatch({ control: form.control, name: "subjectIds" }) ?? [];
  const subjectSpecialties =
    useWatch({ control: form.control, name: "subjectSpecialties" }) ?? {};
  const bioWords = countWords(bio ?? "");
  const isApproved = profileStatus === "approved";
  const teachingSubjects = subjects
    .filter((subject) => selectedSubjects.includes(subject.id))
    .map((subject) => subject.name);

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

  function onValid(values: TeacherOnboardingInput): void {
    startTransition(async () => {
      const result = await saveTeacherOnboarding(values);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Your profile has been updated.");
      router.refresh();
    });
  }

  function onInvalid(): void {
    const errorFields = Object.keys(form.formState.errors);
    const target = sections.find((item) =>
      sectionFields[item.id].some((field) => errorFields.includes(field)),
    );
    if (target && target.id !== section) {
      setSection(target.id);
      toast.error(`Please fix the highlighted fields in ${target.label}.`);
    }
  }

  async function shareProfile(): Promise<void> {
    const url = `${window.location.origin}/find-tutor/${profileSlug}`;
    await navigator.clipboard.writeText(url);
    toast.success("Profile link copied to clipboard.");
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[10rem_minmax(0,1fr)_16rem]">
      <nav aria-label="Profile sections">
        <ul className="flex gap-1 overflow-x-auto [scrollbar-width:none] lg:flex-col lg:overflow-visible [&::-webkit-scrollbar]:hidden">
          {sections.map((item) => {
            const active = item.id === section;
            return (
              <li key={item.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setSection(item.id)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "w-full rounded-lg px-3 py-2 text-start text-sm font-medium transition-colors",
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <form onSubmit={form.handleSubmit(onValid, onInvalid)} noValidate className="min-w-0">
        {section === "about" ? (
          <div className="space-y-6">
            <div>
              <h2 className="font-heading text-2xl font-semibold tracking-tight">About</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Basic details shown on your public tutor profile.
              </p>
            </div>
            <FieldGroup>
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

              <Field data-invalid={!!form.formState.errors.country || undefined}>
                <FieldLabel htmlFor="country">Country</FieldLabel>
                <select
                  id="country"
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  aria-invalid={!!form.formState.errors.country}
                  {...form.register("country")}
                >
                  <option value="">Select your country</option>
                  {countryOptions().map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <FieldDescription>
                  Where you live. This determines how you can be paid and which taxes apply.
                </FieldDescription>
                <FieldError errors={[form.formState.errors.country]} />
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
                  Students filter by language first — list every language you can genuinely
                  teach in.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </div>
        ) : null}

        {section === "photo" ? (
          <div className="space-y-6">
            <div>
              <h2 className="font-heading text-2xl font-semibold tracking-tight">
                Profile photo
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose a photo that will help learners get to know you.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-4">
                <Avatar className="size-16">
                  {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
                  <AvatarFallback className="text-lg">
                    {initials(name || "?")}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{name}</p>
                  {teachingSubjects.length > 0 ? (
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <GraduationCap className="size-3.5 shrink-0" aria-hidden />
                      Teaches {teachingSubjects.join(", ")} lessons
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <Field data-invalid={!!form.formState.errors.avatarUrl || undefined}>
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

            <div>
              <h3 className="font-heading text-lg font-semibold">What your photo needs</h3>
              <ul className="mt-4 space-y-2.5">
                {photoChecklist.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        {section === "video" ? (
          <div className="space-y-6">
            <div>
              <h2 className="font-heading text-2xl font-semibold tracking-tight">
                Video introduction
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Introduce yourself to students in the same language as your written
                description. If you teach a different language, include a short sample.
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

            <div className="rounded-2xl border border-border bg-muted/30 p-5">
              <h3 className="font-heading text-lg font-semibold">Video requirements</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Make sure your video meets the requirements to get approved.
              </p>

              <p className="mt-5 flex items-center gap-2 text-sm font-semibold">
                <Check className="size-4 text-emerald-500" aria-hidden />
                Do
              </p>
              <ul className="mt-2 space-y-2">
                {videoDos.map((item) => (
                  <li key={item} className="ps-6 text-sm text-muted-foreground">
                    {item}
                  </li>
                ))}
              </ul>

              <p className="mt-5 flex items-center gap-2 text-sm font-semibold">
                <X className="size-4 text-destructive" aria-hidden />
                Don&apos;t
              </p>
              <ul className="mt-2 space-y-2">
                {videoDonts.map((item) => (
                  <li key={item} className="ps-6 text-sm text-muted-foreground">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        {section === "description" ? (
          <div className="space-y-6">
            <div>
              <h2 className="font-heading text-2xl font-semibold tracking-tight">
                Description
              </h2>
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
            </FieldGroup>
          </div>
        ) : null}

        {section === "subjects" ? (
          <div className="space-y-6">
            <div>
              <h2 className="font-heading text-2xl font-semibold tracking-tight">Subjects</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Select what you teach and add specialties.
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
            </FieldGroup>
          </div>
        ) : null}

        {section === "pricing" ? (
          <div className="space-y-6">
            <div>
              <h2 className="font-heading text-2xl font-semibold tracking-tight">
                Set your hourly lesson price
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose your hourly lesson rate and currency.
              </p>
            </div>
            <FieldGroup>
              <Field data-invalid={!!form.formState.errors.hourlyRate || undefined}>
                <FieldLabel htmlFor="hourlyRate">Hourly lesson rate</FieldLabel>
                <div className="relative max-w-xs">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                    {currencySymbol(currency)}
                  </span>
                  <Input
                    id="hourlyRate"
                    inputMode="decimal"
                    className="ps-8"
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

            <details className="group rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium [&::-webkit-details-marker]:hidden">
                Amazing Skills commission
                <ChevronDown
                  className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <p className="mt-3 text-sm text-muted-foreground">
                Amazing Skills takes zero commission on lesson earnings. Students pay you
                directly via your linked PayPal account.
              </p>
            </details>
          </div>
        ) : null}

        {section === "background" ? (
          <div className="space-y-6">
            <div>
              <h2 className="font-heading text-2xl font-semibold tracking-tight">
                Background
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Degrees, certificates, and professional credentials.
              </p>
            </div>
            <FieldGroup>
              <QualificationFields form={form} />
            </FieldGroup>
          </div>
        ) : null}

        <div className="mt-8 flex justify-end">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>

      <aside className="order-first lg:order-none">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm lg:sticky lg:top-24">
          <div className="flex items-center gap-3">
            <Avatar size="lg">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
              <AvatarFallback>{initials(name || "?")}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{name}</p>
              <StatusBadge tone={statusTone(profileStatus)}>
                {formatStatus(profileStatus)}
              </StatusBadge>
            </div>
          </div>

          {isApproved ? (
            <div className="mt-4 space-y-2">
              <Button
                variant="outline"
                className="w-full"
                render={<Link href={`/find-tutor/${profileSlug}`} />}
              >
                <Eye className="size-4" aria-hidden />
                Preview profile
              </Button>
              <Button variant="outline" className="w-full" onClick={shareProfile}>
                <Share2 className="size-4" aria-hidden />
                Share profile
              </Button>
            </div>
          ) : (
            <p className="mt-4 text-xs text-muted-foreground">
              Your public profile becomes available once your profile is approved.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
