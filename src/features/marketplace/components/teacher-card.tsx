import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatCurrency } from "@/lib/format";

import { RatingStars } from "./rating-stars";

type TeacherCardData = {
  slug: string;
  headline: string | null;
  bio: string;
  hourlyRateCents: number;
  currency: string;
  user: { name: string; avatarUrl: string | null };
  subjects: Array<{ subject: { name: string; slug: string } }>;
  rating: { average: number; count: number };
};

export function TeacherCard({ teacher }: { teacher: TeacherCardData }) {
  return (
    <Link
      href={`/find-tutor/${teacher.slug}`}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar size="lg">
            {teacher.user.avatarUrl ? (
              <AvatarImage src={teacher.user.avatarUrl} alt="" />
            ) : null}
            <AvatarFallback>{teacher.user.name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-semibold">{teacher.user.name}</p>
            <RatingStars
              average={teacher.rating.average}
              count={teacher.rating.count}
              showCount={false}
            />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-semibold">
            {formatCurrency(teacher.hourlyRateCents, teacher.currency)}
          </p>
          <p className="text-xs text-muted-foreground">per hour</p>
        </div>
      </div>

      {teacher.headline ? (
        <p className="text-sm font-medium leading-snug">{teacher.headline}</p>
      ) : null}
      <p className="line-clamp-2 text-sm text-muted-foreground">{teacher.bio}</p>

      <div className="mt-auto flex flex-wrap gap-1.5">
        {teacher.subjects.slice(0, 4).map(({ subject }) => (
          <span
            key={subject.slug}
            className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
          >
            {subject.name}
          </span>
        ))}
        {teacher.subjects.length > 4 ? (
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
            +{teacher.subjects.length - 4} more
          </span>
        ) : null}
      </div>
    </Link>
  );
}
