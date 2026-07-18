"use client";

import { Plus, Trash2 } from "lucide-react";
import { useFieldArray, useWatch, type UseFormReturn } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { TeacherOnboardingInput } from "@/lib/validations/teacher-onboarding";

import { CredentialUploader } from "./credential-uploader";

export function QualificationFields({
  form,
}: {
  form: UseFormReturn<TeacherOnboardingInput>;
}) {
  const qualifications = useFieldArray({
    control: form.control,
    name: "qualifications",
  });
  const watchedQualifications = useWatch({
    control: form.control,
    name: "qualifications",
  });

  return (
    <Field data-invalid={!!form.formState.errors.qualifications || undefined}>
      <div className="flex items-center justify-between">
        <div>
          <FieldLabel>Qualifications</FieldLabel>
          <p className="text-xs text-muted-foreground">
            Add degrees, certificates, or professional credentials.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            qualifications.append({
              title: "",
              institution: "",
              issuedYear: "",
              credentialUrl: "",
            })
          }
          disabled={qualifications.fields.length >= 10}
        >
          <Plus className="size-3.5" aria-hidden />
          Add
        </Button>
      </div>

      <div className="space-y-4">
        {qualifications.fields.map((qualification, index) => {
          const errors = form.formState.errors.qualifications?.[index];
          const credentialUrl = watchedQualifications?.[index]?.credentialUrl ?? "";
          return (
            <div
              key={qualification.id}
              className="grid gap-3 rounded-lg border border-border bg-muted/20 p-4 sm:grid-cols-2"
            >
              <Field data-invalid={!!errors?.title || undefined}>
                <FieldLabel htmlFor={`qualification-${index}-title`}>Title</FieldLabel>
                <Input
                  id={`qualification-${index}-title`}
                  placeholder="BSc Mathematics"
                  {...form.register(`qualifications.${index}.title`)}
                />
                <FieldError errors={[errors?.title]} />
              </Field>
              <Field data-invalid={!!errors?.institution || undefined}>
                <FieldLabel htmlFor={`qualification-${index}-institution`}>
                  Institution
                </FieldLabel>
                <Input
                  id={`qualification-${index}-institution`}
                  placeholder="University of Cape Town"
                  {...form.register(`qualifications.${index}.institution`)}
                />
                <FieldError errors={[errors?.institution]} />
              </Field>
              <Field data-invalid={!!errors?.issuedYear || undefined}>
                <FieldLabel htmlFor={`qualification-${index}-year`}>Year awarded</FieldLabel>
                <Input
                  id={`qualification-${index}-year`}
                  inputMode="numeric"
                  placeholder="2020"
                  {...form.register(`qualifications.${index}.issuedYear`)}
                />
                <FieldError errors={[errors?.issuedYear]} />
              </Field>
              <Field data-invalid={!!errors?.credentialUrl || undefined}>
                <FieldLabel>Credential file (optional)</FieldLabel>
                <input type="hidden" {...form.register(`qualifications.${index}.credentialUrl`)} />
                <CredentialUploader
                  credentialUrl={credentialUrl}
                  onUploaded={(url) =>
                    form.setValue(`qualifications.${index}.credentialUrl`, url, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                  onCleared={() =>
                    form.setValue(`qualifications.${index}.credentialUrl`, "", {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                />
                <FieldError errors={[errors?.credentialUrl]} />
              </Field>
              {qualifications.fields.length > 1 ? (
                <div className="sm:col-span-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => qualifications.remove(index)}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    Remove
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <FieldError
        errors={
          "message" in (form.formState.errors.qualifications ?? {})
            ? [form.formState.errors.qualifications]
            : undefined
        }
      />
    </Field>
  );
}
