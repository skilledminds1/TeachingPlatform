"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { updateStudentSettings } from "@/actions/student-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StudentAvatarUploader } from "@/features/student-dashboard/components/student-avatar-uploader";
import { countryOptions } from "@/lib/countries";
import { TIMEZONE_OPTIONS } from "@/lib/timezone";
import { countryForTimeZone } from "@/lib/timezone-country";

export function StudentSettingsForm({
  initialName,
  email,
  initialTimezone,
  initialCountry,
  initialAvatarUrl,
}: {
  initialName: string;
  email: string;
  initialTimezone: string;
  initialCountry: string | null;
  initialAvatarUrl: string;
}) {
  const [name, setName] = useState(initialName);
  const [timezone, setTimezone] = useState(initialTimezone);
  // INT-13: accounts created before the country field exists land here with null. The
  // zone-derived guess is offered as a starting point, never saved without the user
  // pressing save on it.
  const [country, setCountry] = useState(
    () => initialCountry ?? countryForTimeZone(initialTimezone) ?? "",
  );
  const countries = countryOptions();
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [isPending, startTransition] = useTransition();

  function save(): void {
    startTransition(async () => {
      const result = await updateStudentSettings({ name, timezone, country });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Account details updated.");
    });
  }

  return (
    <div className="space-y-5">
      <StudentAvatarUploader
        avatarUrl={avatarUrl}
        name={name}
        onUploaded={setAvatarUrl}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="student-name">Full name</Label>
          <Input
            id="student-name"
            value={name}
            autoComplete="name"
            onChange={(event) => setName(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            This name appears in lessons, messages, and course activity.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="student-email">Email address</Label>
          <Input id="student-email" value={email} disabled />
          <p className="text-xs text-muted-foreground">
            Your email is managed by your sign-in account.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="student-timezone">Timezone</Label>
        <select
          id="student-timezone"
          value={timezone}
          onChange={(event) => setTimezone(event.target.value)}
          className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:max-w-md [&>option]:bg-background"
        >
          {TIMEZONE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Lesson times, reminders, and classroom schedules use this timezone.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="student-country">Country</Label>
        <select
          id="student-country"
          value={country}
          onChange={(event) => setCountry(event.target.value)}
          className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:max-w-md [&>option]:bg-background"
        >
          <option value="">Select your country</option>
          {countries.map((option) => (
            <option key={option.code} value={option.code}>
              {option.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Where you live. This determines how you can be paid and which taxes apply.
        </p>
      </div>

      <Button onClick={save} disabled={isPending || name.trim().length < 2}>
        {isPending ? "Saving…" : "Save profile"}
      </Button>
    </div>
  );
}
