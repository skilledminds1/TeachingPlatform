import { fromMinorUnits } from "@/lib/currencies";

/**
 * schema.org payloads for teacher and course pages (GLO-02).
 *
 * Pure functions taking already-loaded data, so the shapes can be asserted in tests without
 * a database or a rendered page. Rendering — and the CSP nonce and `<` escaping that inline
 * JSON-LD needs — is the JsonLd component's job.
 *
 * Prices go through fromMinorUnits rather than a hardcoded `/100`, because INT-09 already
 * established that not every currency has two minor units. A ¥5000 lesson published as
 * "50.00" would be an order-of-magnitude lie in a field crawlers surface directly.
 *
 * `aggregateRating` is omitted entirely when there are no reviews. Google treats a rating of
 * 0 from 0 reviews as invalid structured data, and emitting it risks a manual action against
 * the whole domain rather than a quietly ignored field.
 */

/**
 * Serialize a payload for embedding in an inline `<script>`.
 *
 * The data carries user-authored text — teacher bios, course descriptions. `JSON.stringify`
 * does not escape `<`, so a bio containing `</script>` closes the element early and every
 * byte after it parses as HTML: a stored-XSS vector wearing a structured-data costume.
 * `<` is valid JSON, parses back to `<`, and cannot terminate the tag.
 */
export function serializeJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

type TeacherForJsonLd = {
  headline: string | null;
  bio: string;
  hourlyRateCents: number;
  currency: string;
  user: { name: string | null; avatarUrl: string | null };
  subjects: Array<{ subject: { name: string } }>;
  rating: { average: number; count: number };
};

type CourseForJsonLd = {
  title: string;
  description: string;
  coverImageUrl: string | null;
  effectivePriceCents: number;
  currency: string;
  level: string | null;
  ratingAverage: number | null;
  ratingCount: number | null;
  teacher: { name: string | null };
};

function aggregateRating(average: number, count: number) {
  if (count <= 0) return undefined;
  return {
    "@type": "AggregateRating",
    ratingValue: Number(average.toFixed(2)),
    reviewCount: count,
    bestRating: 5,
    worstRating: 1,
  };
}

export function teacherJsonLd(
  teacher: TeacherForJsonLd,
  slug: string,
  baseUrl: string,
): Record<string, unknown> {
  const url = `${baseUrl}/find-tutor/${slug}`;
  const name = teacher.user.name ?? "Teacher";
  const subjects = teacher.subjects.map((entry) => entry.subject.name);

  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    mainEntity: {
      "@type": "Person",
      name,
      url,
      ...(teacher.headline ? { jobTitle: teacher.headline } : {}),
      description: teacher.bio.slice(0, 500),
      ...(teacher.user.avatarUrl ? { image: teacher.user.avatarUrl } : {}),
      ...(subjects.length ? { knowsAbout: subjects } : {}),
      makesOffer: {
        "@type": "Offer",
        price: fromMinorUnits(teacher.hourlyRateCents, teacher.currency),
        priceCurrency: teacher.currency,
        availability: "https://schema.org/InStock",
        itemOffered: {
          "@type": "Service",
          name: `Online tutoring with ${name}`,
          serviceType: subjects.length ? subjects.join(", ") : "Online tutoring",
        },
      },
      ...(aggregateRating(teacher.rating.average, teacher.rating.count)
        ? { aggregateRating: aggregateRating(teacher.rating.average, teacher.rating.count) }
        : {}),
    },
  };
}

export function courseJsonLd(
  course: CourseForJsonLd,
  slug: string,
  baseUrl: string,
): Record<string, unknown> {
  const url = `${baseUrl}/courses/${slug}`;
  const rating = aggregateRating(course.ratingAverage ?? 0, course.ratingCount ?? 0);

  return {
    "@context": "https://schema.org",
    "@type": "Course",
    name: course.title,
    url,
    description: course.description.slice(0, 500),
    ...(course.coverImageUrl ? { image: course.coverImageUrl } : {}),
    provider: { "@type": "Organization", name: "Amazing Skills", url: baseUrl },
    ...(course.teacher.name
      ? { author: { "@type": "Person", name: course.teacher.name } }
      : {}),
    ...(course.level ? { educationalLevel: course.level } : {}),
    // Required by Google for a Course rich result: how it is delivered, and what it costs.
    hasCourseInstance: {
      "@type": "CourseInstance",
      courseMode: "online",
      courseWorkload: "PT1H",
    },
    offers: {
      "@type": "Offer",
      price: fromMinorUnits(course.effectivePriceCents, course.currency),
      priceCurrency: course.currency,
      category: "Paid",
      availability: "https://schema.org/InStock",
      url,
    },
    ...(rating ? { aggregateRating: rating } : {}),
  };
}
