import Link from "next/link";
import type { CourseLevel } from "@prisma/client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatCourseLevel } from "@/features/courses/lib/labels";
import { formatCurrency } from "@/lib/format";

type CourseCardData = {
  slug: string;
  title: string;
  description: string;
  coverImageUrl: string | null;
  priceCents: number;
  effectivePriceCents: number;
  ratingAverage: number | null;
  ratingCount: number;
  activeSale: { id: string } | null;
  currency: string;
  level: CourseLevel;
  subject: { name: string; slug: string } | null;
  teacher: {
    name: string;
    avatarUrl: string | null;
  };
  _count: { modules: number; enrollments: number };
};

export function CourseCard({ course }: { course: CourseCardData }) {
  return (
    <Link
      href={`/courses/${course.slug}`}
      className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-colors hover:border-primary/40"
    >
      <div className="aspect-[16/9] bg-muted">
        {course.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={course.coverImageUrl}
            alt=""
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
            No cover image
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="line-clamp-2 font-semibold leading-snug">{course.title}</p>
            <p className="text-xs text-muted-foreground">
              {formatCourseLevel(course.level)}
              {course.subject ? ` · ${course.subject.name}` : ""}
            </p>
          </div>
          <p className="shrink-0 font-semibold">
            {course.effectivePriceCents === 0
              ? "Free"
              : formatCurrency(course.effectivePriceCents, course.currency)}
          </p>
        </div>

        <p className="line-clamp-2 text-sm text-muted-foreground">{course.description}</p>
        <div className="flex items-center gap-2 text-xs">
          {course.ratingAverage ? (
            <span className="text-amber-600">★ {course.ratingAverage.toFixed(1)} ({course.ratingCount})</span>
          ) : (
            <span className="text-muted-foreground">No reviews yet</span>
          )}
          {course.activeSale ? <span className="font-medium text-emerald-600">On sale</span> : null}
          {course.activeSale && course.effectivePriceCents < course.priceCents ? (
            <span className="text-muted-foreground line-through">
              {formatCurrency(course.priceCents, course.currency)}
            </span>
          ) : null}
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <div className="flex min-w-0 items-center gap-2">
            <Avatar size="sm">
              {course.teacher.avatarUrl ? (
                <AvatarImage src={course.teacher.avatarUrl} alt="" />
              ) : null}
              <AvatarFallback>
                {course.teacher.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <p className="truncate text-sm">{course.teacher.name}</p>
          </div>
          <p className="shrink-0 text-xs text-muted-foreground">
            {course._count.modules} module{course._count.modules === 1 ? "" : "s"}
          </p>
        </div>
      </div>
    </Link>
  );
}
