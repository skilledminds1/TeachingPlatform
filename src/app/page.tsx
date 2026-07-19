import type { Metadata } from "next";

import { Cta } from "@/features/marketing/components/cta";
import { Faq } from "@/features/marketing/components/faq";
import { Features } from "@/features/marketing/components/features";
import { ForTeachers } from "@/features/marketing/components/for-teachers";
import { Hero } from "@/features/marketing/components/hero";
import { HowItWorks } from "@/features/marketing/components/how-it-works";
import { Pricing } from "@/features/marketing/components/pricing";
import { SiteFooter } from "@/features/marketing/components/site-footer";
import { SiteHeader } from "@/features/marketing/components/site-header";
import { Subjects } from "@/features/marketing/components/subjects";
import { Testimonials } from "@/features/marketing/components/testimonials";
import { getMarketingPlans } from "@/server/billing/pricing";

export const metadata: Metadata = {
  title: "Amazing Skills — Live Tutoring & Self-Paced Courses",
  description:
    "Book live 1-on-1 lessons with verified tutors or learn at your own pace with expert-built courses. Direct payments, honest reviews, and certificates — all in one platform.",
  openGraph: {
    title: "Amazing Skills — Live Tutoring & Self-Paced Courses",
    description:
      "Book live 1-on-1 lessons with verified tutors or learn at your own pace with expert-built courses. Direct payments, no platform markup.",
    type: "website",
  },
};

export default async function HomePage() {
  const plans = await getMarketingPlans();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Subjects />
        <HowItWorks />
        <Features />
        <ForTeachers />
        <Pricing plans={plans} />
        <Testimonials />
        <Faq />
        <Cta />
      </main>
      <SiteFooter />
    </div>
  );
}
