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
import { getMarketingPlans } from "@/server/billing/pricing";

/**
 * The title and description are what a search result, a shared link and a reviewer read
 * before anything renders, so they say what is sold: software, on a subscription. The
 * previous pair described booking a lesson, which is the thing this platform specifically
 * does NOT sell — lesson fees pass between student and teacher at 0% commission.
 */
export const metadata: Metadata = {
  title: "Amazing Skills — Software for Online Tutoring Businesses",
  description:
    "Scheduling, live video classrooms and student management for tutors and tutoring academies, from $12 a month. Your students pay you directly — we take 0% commission on lessons.",
  openGraph: {
    title: "Amazing Skills — Software for Online Tutoring Businesses",
    description:
      "Run your tutoring online: scheduling, live video classrooms and student management in one subscription. 0% commission on lessons.",
    type: "website",
  },
};

export default async function HomePage() {
  const plans = await getMarketingPlans();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <Hero />
        <Subjects />
        <HowItWorks />
        <Features />
        <ForTeachers />
        <Pricing plans={plans} />
        <Faq />
        <Cta />
      </main>
      <SiteFooter />
    </div>
  );
}
