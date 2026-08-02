"use client";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  getSubjectSpecialties,
  subjectHasSpecialties,
} from "@/lib/subject-specialties";

const selectClassName =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 [&>option]:bg-background";

interface SubjectOption {
  id: string;
  name: string;
  slug: string;
}

export function SubjectSpecialtyFields({
  subjects,
  selectedIds,
  specialtiesBySubjectId,
  onChange,
  maxPerSubject = 8,
}: {
  subjects: SubjectOption[];
  selectedIds: string[];
  specialtiesBySubjectId: Record<string, string[]>;
  onChange: (next: Record<string, string[]>) => void;
  maxPerSubject?: number;
}) {
  const selectable = subjects.filter(
    (subject) => selectedIds.includes(subject.id) && subjectHasSpecialties(subject.slug),
  );

  if (selectable.length === 0) return null;

  function setSpecialties(subjectId: string, specialties: string[]): void {
    const next = { ...specialtiesBySubjectId };
    if (specialties.length === 0) delete next[subjectId];
    else next[subjectId] = specialties;
    onChange(next);
  }

  function addSpecialty(subjectId: string, specialty: string, options: readonly string[]): void {
    if (!specialty || !options.includes(specialty)) return;
    const current = specialtiesBySubjectId[subjectId] ?? [];
    if (current.includes(specialty) || current.length >= maxPerSubject) return;
    setSpecialties(subjectId, [...current, specialty]);
  }

  function removeSpecialty(subjectId: string, specialty: string): void {
    setSpecialties(
      subjectId,
      (specialtiesBySubjectId[subjectId] ?? []).filter((item) => item !== specialty),
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
      <div>
        <FieldLabel>Subject details (optional)</FieldLabel>
        <FieldDescription>
          Clarify what you teach within each subject — for example, Python under Technology.
        </FieldDescription>
      </div>

      <div className="space-y-5">
        {selectable.map((subject) => {
          const options = getSubjectSpecialties(subject.slug);
          const selected = specialtiesBySubjectId[subject.id] ?? [];
          const available = options.filter((option) => !selected.includes(option));
          const atLimit = selected.length >= maxPerSubject;

          return (
            <div key={subject.id} className="space-y-2">
              <p className="text-sm font-medium">{subject.name}</p>
              <select
                className={selectClassName}
                value=""
                disabled={atLimit || available.length === 0}
                aria-label={`Add ${subject.name} specialty`}
                onChange={(event) => {
                  addSpecialty(subject.id, event.target.value, options);
                  event.target.value = "";
                }}
              >
                <option value="">
                  {atLimit
                    ? `Maximum of ${maxPerSubject} details selected`
                    : available.length === 0
                      ? "All details selected"
                      : `Select ${subject.name.toLowerCase()} focus…`}
                </option>
                {available.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>

              {selected.length > 0 ? (
                <ul className="flex flex-wrap gap-2" aria-label={`${subject.name} specialties`}>
                  {selected.map((specialty) => (
                    <li key={specialty}>
                      <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background py-1 pe-1 ps-2.5 text-sm">
                        {specialty}
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          className="size-6"
                          aria-label={`Remove ${specialty}`}
                          onClick={() => removeSpecialty(subject.id, specialty)}
                        >
                          <X className="size-3.5" aria-hidden />
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
