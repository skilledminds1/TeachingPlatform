import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatCurrency } from "@/lib/format";
import { languageName } from "@/lib/languages";
import { IndicativePrice } from "./indicative-price";

import { RatingStars } from "./rating-stars";

type TeacherCardData = {
  slug: string;
  headline: string | null;
  bio: string;
  hourlyRateCents: number;
  currency: string;
  user: { name: string; avatarUrl: string | null };
  subjects: Array<{ subject: { name: string; slug: string } }>;
  languages: Array<{ code: string; proficiency: string }>;
  rating: { average: number; count: number };
};

export function TeacherCard({
  teacher,
  fxRates,
  fxStale,
}: {
  teacher: TeacherCardData;
  /** INT-11: units per 1 USD, for the indicative viewer-currency price. */
  fxRates: Record<string, number>;
  fxStale: boolean;
}) {
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
          <IndicativePrice
            amountMinorUnits={teacher.hourlyRateCents}
            currency={teacher.currency}
            rates={fxRates}
            stale={fxStale}
          />
        </div>
      </div>

      {teacher.headline ? (
        <p className="text-sm font-medium leading-snug">{teacher.headline}</p>
      ) : null}
      <p className="line-clamp-2 text-sm text-muted-foreground">{teacher.bio}</p>

      {/* INT-10: surface languages on the card. A student filtering by language needs to
          see the match without opening every profile. */}
      {teacher.languages.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Teaches in{" "}
          <span className="font-medium text-foreground">
            {teacher.languages
              .slice(0, 3)
              .map((language) => languageName(language.code))
              .join(", ")}
          </span>
          {teacher.languages.length > 3
            ? ` +${teacher.languages.length - 3} more`
            : ""}
        </p>
      ) : null}

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
