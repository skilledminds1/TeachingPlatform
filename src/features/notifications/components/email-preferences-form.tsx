"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  updateNotificationPreferences,
  type NotificationPreferences,
} from "@/actions/notification-preferences";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors",
        checked ? "border-primary bg-primary" : "border-border bg-muted",
      )}
    >
      <span
        className={cn(
          "block size-5 rounded-full bg-background shadow-sm transition-transform",
          checked ? "translate-x-[1.375rem]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

export function EmailPreferencesForm({
  initialPreferences,
}: {
  initialPreferences: NotificationPreferences;
}) {
  const [preferences, setPreferences] = useState(initialPreferences);
  const [pending, startTransition] = useTransition();
  const options = [
    {
      key: "emailReminders" as const,
      title: "Lesson reminders",
      description: "Upcoming lesson and schedule reminders.",
    },
    {
      key: "emailMessages" as const,
      title: "New messages",
      description: "Email a preview when a teacher or student messages you.",
    },
    {
      key: "emailMarketing" as const,
      title: "Tips, research, and product news",
      description: "Optional advice, surveys, and announcements.",
    },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Security, payment, legal, mediation, and essential account emails are always delivered.
      </p>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {options.map((option) => (
          <li key={option.key} className="flex items-start justify-between gap-4 px-5 py-4">
            <div>
              <p className="font-medium">{option.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{option.description}</p>
            </div>
            <Toggle
              checked={preferences[option.key]}
              label={option.title}
              onChange={(checked) =>
                setPreferences((current) => ({ ...current, [option.key]: checked }))
              }
            />
          </li>
        ))}
      </ul>
      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await updateNotificationPreferences(preferences);
            if (!result.success) {
              toast.error(result.error);
              return;
            }
            setPreferences(result.data);
            toast.success("Email preferences saved.");
          })
        }
      >
        {pending ? "Saving…" : "Save email preferences"}
      </Button>
    </div>
  );
}
