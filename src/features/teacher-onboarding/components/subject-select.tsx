"use client";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

const selectClassName =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 [&>option]:bg-background";

interface SubjectOption {
  id: string;
  name: string;
  slug: string;
}

export function SubjectSelect({
  subjects,
  selectedIds,
  onChange,
  max = 3,
}: {
  subjects: SubjectOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  max?: number;
}) {
  const selected = subjects.filter((subject) => selectedIds.includes(subject.id));
  const available = subjects.filter((subject) => !selectedIds.includes(subject.id));
  const atLimit = selectedIds.length >= max;

  function addSubject(subjectId: string): void {
    if (!subjectId || selectedIds.includes(subjectId) || atLimit) return;
    onChange([...selectedIds, subjectId]);
  }

  function removeSubject(subjectId: string): void {
    onChange(selectedIds.filter((id) => id !== subjectId));
  }

  return (
    <div className="space-y-3">
      <select
        className={selectClassName}
        value=""
        disabled={atLimit || available.length === 0}
        aria-label="Add a subject"
        onChange={(event) => {
          addSubject(event.target.value);
          event.target.value = "";
        }}
      >
        <option value="">
          {atLimit
            ? `Maximum of ${max} subjects selected`
            : available.length === 0
              ? "All subjects selected"
              : "Select a subject to add…"}
        </option>
        {available.map((subject) => (
          <option key={subject.id} value={subject.id}>
            {subject.name}
          </option>
        ))}
      </select>

      {selected.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Selected subjects">
          {selected.map((subject) => (
            <li key={subject.id}>
              <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 py-1 pr-1 pl-2.5 text-sm">
                {subject.name}
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="size-6"
                  aria-label={`Remove ${subject.name}`}
                  onClick={() => removeSubject(subject.id)}
                >
                  <X className="size-3.5" aria-hidden />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Choose at least one subject from the list.</p>
      )}
    </div>
  );
}
