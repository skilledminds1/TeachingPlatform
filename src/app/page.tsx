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

export const metadata: Metadata = {
  title: "Amazing Skills — Find Tutors & Book Live Lessons",
  description:
    "Connect with expert tutors, book sessions in minutes, and learn live online. Verified teachers, direct payments, and browser-based video lessons — built for South Africa.",
  openGraph: {
    title: "Amazing Skills — Find Tutors & Book Live Lessons",
    description:
      "Connect with expert tutors, book sessions in minutes, and learn live online. Verified teachers, direct payments, no platform markup.",
    type: "website",
  },
};

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Subjects />
        <HowItWorks />
        <Features />
        <ForTeachers />
        <Pricing />
        <Testimonials />
        <Faq />
        <Cta />
      </main>
      <SiteFooter />
    </div>
  );
}
