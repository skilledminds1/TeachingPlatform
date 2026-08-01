"use client";

import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  LANGUAGE_PROFICIENCIES,
  languageName,
  teachingLanguageOptions,
  type LanguageProficiency,
} from "@/lib/languages";

const selectClassName =
  "h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export type EditableLanguage = { code: string; proficiency: LanguageProficiency };

/**
 * INT-10: teachers declare the languages they can teach in.
 *
 * Kept deliberately small — a list of rows, each a language plus a proficiency. Students
 * filter on the language alone; proficiency is shown on the profile so they can judge
 * whether it is a good fit for a beginner.
 */
export function LanguageEditor({
  value,
  onChange,
  error,
}: {
  value: EditableLanguage[];
  onChange: (next: EditableLanguage[]) => void;
  error?: string;
}) {
  const options = teachingLanguageOptions();
  const chosen = new Set(value.map((item) => item.code));
  const firstUnused = options.find((option) => !chosen.has(option.code));

  function update(index: number, patch: Partial<EditableLanguage>): void {
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  return (
    <div className="space-y-3">
      {value.map((language, index) => (
        <div key={`${language.code}-${index}`} className="flex flex-wrap items-center gap-2">
          <select
            className={`${selectClassName} min-w-44 flex-1`}
            value={language.code}
            aria-label={`Language ${index + 1}`}
            onChange={(event) => update(index, { code: event.target.value })}
          >
            {options.map((option) => (
              <option
                key={option.code}
                value={option.code}
                // Prevent picking the same language twice; the server rejects duplicates.
                disabled={option.code !== language.code && chosen.has(option.code)}
              >
                {option.name}
              </option>
            ))}
          </select>

          <select
            className={selectClassName}
            value={language.proficiency}
            aria-label={`${languageName(language.code)} proficiency`}
            onChange={(event) =>
              update(index, { proficiency: event.target.value as LanguageProficiency })
            }
          >
            {LANGUAGE_PROFICIENCIES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Remove ${languageName(language.code)}`}
            // At least one language is required, so never offer to remove the last row.
            disabled={value.length <= 1}
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      ))}

      {firstUnused && value.length < 6 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange([...value, { code: firstUnused.code, proficiency: "conversational" }])
          }
        >
          <Plus className="size-4" aria-hidden />
          Add a language
        </Button>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
