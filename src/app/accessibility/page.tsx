import type { Metadata } from "next";

import { LegalDocumentPage } from "@/features/legal/components/legal-document-page";

export const metadata: Metadata = {
  title: "Accessibility Statement",
  description:
    "How accessible Amazing Skills is, what conformance target we hold ourselves to, the known gaps, and how to report a barrier.",
  alternates: { canonical: "/accessibility" },
};

/**
 * GLO-03. The European Accessibility Act has applied to consumer e-commerce since June 2025
 * and reaches non-EU traders serving EU consumers; South Africa's PEPUDA and the UK Equality
 * Act carry comparable civil exposure.
 *
 * Written to be honest rather than reassuring. A statement that claims full conformance and
 * is wrong is worse than one that names its gaps: the gaps are what a user needs to know
 * before relying on the platform, and naming them is also the difference between a good-faith
 * position and a misrepresentation.
 */
export default function AccessibilityPage() {
  return (
    <LegalDocumentPage
      title="Accessibility Statement"
      introduction="Amazing Skills is used by students and teachers who navigate with keyboards, screen readers, magnification and voice control. This statement sets out the standard we work to, what we know is not yet there, and how to tell us when something blocks you."
      sections={[
        {
          title: "1. Conformance target",
          paragraphs: [
            "We work to the Web Content Accessibility Guidelines (WCAG) 2.2 at Level AA. We describe the platform as partially conformant: most of it meets that standard, and the specific areas that do not are listed in section 3 rather than left for you to find.",
            "Automated accessibility rules run on every change and block a release that introduces a new violation. Automated checks cannot detect every barrier — they do not judge whether a label is meaningful or whether a flow makes sense — so they are a floor, not a guarantee.",
          ],
        },
        {
          title: "2. What works today",
          paragraphs: [
            "Every page starts with a “Skip to main content” link, so navigation and the marketplace filters can be bypassed rather than tabbed through on each page load.",
            "Pages use landmark regions (banner, navigation, main, contentinfo) and a heading outline that reflects the structure of the page, so a screen reader can jump between sections instead of reading linearly.",
            "Every form control has a programmatically associated label, images that convey meaning carry alternative text, and decorative images are hidden from assistive technology. Interactive controls are reachable and operable by keyboard with a visible focus indicator.",
          ],
        },
        {
          title: "3. Known gaps",
          paragraphs: [
            "Video captions. Teacher introduction videos are uploaded by teachers, and we do not currently generate captions or transcripts for them, so a deaf or hard-of-hearing student cannot get what a teacher says about themselves in that video. Closing it requires a transcription pipeline, which is planned work rather than a completed feature. The introduction video is never the only description of a teacher — the written profile, subjects, rates and reviews carry the same ground — and if a video is inaccessible to you, contact us and we will arrange an alternative.",
            "Interface language. The interface is available in English only, which is a barrier for users who rely on their own language to use a service confidently. Translation is planned.",
            "Live video lessons. The classroom is provided through a third-party video service. We have not completed an independent accessibility assessment of that component and cannot yet make claims about it.",
            "Third-party payment pages. Checkout is completed on the payment provider’s own pages, which are outside our control and not covered by this statement.",
          ],
        },
        {
          title: "4. Reporting a barrier",
          paragraphs: [
            "If any part of Amazing Skills prevents you from doing something, tell us and we will treat it as a defect rather than a request. Describe the page, what you were trying to do, and the assistive technology or input method you were using if that is relevant.",
            "Contact us through the support address published in our Privacy Policy. We aim to acknowledge accessibility reports within five working days and to give you a position on a fix — including a timeline, or an honest statement that it is not near-term — rather than an acknowledgement alone.",
            "If we cannot resolve something quickly, ask us for the content or the task in another form. We would rather complete a booking with you directly than leave you unable to make one.",
          ],
        },
        {
          title: "5. Scope and status of this statement",
          paragraphs: [
            "This statement covers the Amazing Skills web platform. It reflects the state of the platform at the time of writing and is revised when a listed gap closes or a new one is identified.",
            "It is a self-assessment. It has not been verified by an independent accessibility audit, and we say so rather than implying a certification we do not hold.",
          ],
        },
      ]}
    />
  );
}
