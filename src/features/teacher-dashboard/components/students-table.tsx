"use client";

import { CalendarDays, MessageSquare, Search, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { StatusBadge, statusTone } from "@/features/admin/components/status-badge";
import { cn } from "@/lib/utils";

export type StudentTableRow = {
  relationshipId: string;
  name: string;
  avatarUrl: string | null;
  status: "active" | "archived";
  completedLessons: number;
  totalLessons: number;
  nextLessonLabel: string | null;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function StudentsTable({ students }: { students: StudentTableRow[] }) {
  const [query, setQuery] = useState("");
  const [currentOnly, setCurrentOnly] = useState(true);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return students.filter((student) => {
      if (currentOnly && student.status !== "active") return false;
      if (!normalized) return true;
      return student.name.toLowerCase().includes(normalized);
    });
  }, [students, query, currentOnly]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            className="ps-9"
            aria-label="Search students"
          />
        </div>

        <button
          type="button"
          onClick={() => setCurrentOnly((value) => !value)}
          aria-pressed={currentOnly}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors",
            currentOnly
              ? "border-foreground/60 bg-background text-foreground"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          Current
          {currentOnly ? <X className="size-3.5" aria-hidden /> : null}
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border/60 text-start text-xs text-muted-foreground">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Lessons</th>
                <th className="px-5 py-3 font-medium">Next lesson</th>
                <th className="px-5 py-3 font-medium">Suggested action</th>
                <th className="px-5 py-3" aria-label="Row actions" />
              </tr>
            </thead>
            <tbody>
              {visible.map((student) => (
                <tr
                  key={student.relationshipId}
                  className="border-b border-border/40 last:border-b-0 hover:bg-muted/30"
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <Avatar size="lg">
                        {student.avatarUrl ? (
                          <AvatarImage src={student.avatarUrl} alt="" />
                        ) : null}
                        <AvatarFallback>{initials(student.name)}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{student.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge tone={statusTone(student.status)}>
                      {student.status}
                    </StatusBadge>
                  </td>
                  <td className="px-5 py-4">
                    {student.totalLessons > 0 ? (
                      <div className="flex items-center gap-2.5">
                        <span
                          className="h-1.5 w-16 overflow-hidden rounded-full bg-muted"
                          aria-hidden
                        >
                          <span
                            className="block h-full rounded-full bg-foreground"
                            style={{
                              width: `${Math.round(
                                (student.completedLessons / student.totalLessons) * 100,
                              )}%`,
                            }}
                          />
                        </span>
                        <span className="text-muted-foreground">
                          {student.completedLessons}/{student.totalLessons}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">
                    {student.nextLessonLabel ?? "-"}
                  </td>
                  <td className="px-5 py-4">
                    {student.nextLessonLabel ? (
                      <span className="text-muted-foreground">-</span>
                    ) : (
                      <Link
                        href="/dashboard/messages"
                        className="font-medium underline underline-offset-4 hover:text-primary"
                      >
                        Message student
                      </Link>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href="/dashboard/messages"
                        aria-label={`Message ${student.name}`}
                        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <MessageSquare className="size-4" aria-hidden />
                      </Link>
                      <Link
                        href="/dashboard/teacher/bookings"
                        aria-label={`View bookings with ${student.name}`}
                        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <CalendarDays className="size-4" aria-hidden />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {visible.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <UserRound className="size-5" aria-hidden />
            </div>
            <h2 className="mt-4 text-sm font-semibold">
              {students.length === 0 ? "No students yet" : "No students match"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {students.length === 0
                ? "When a student books with you and is accepted, they will appear here."
                : "Try a different search or clear the Current filter."}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
