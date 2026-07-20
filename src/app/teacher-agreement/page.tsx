import type { Metadata } from "next";

import { LegalDocumentPage } from "@/features/legal/components/legal-document-page";

export const metadata: Metadata = { title: "Teacher Agreement" };

export default function TeacherAgreementPage() {
  return (
    <LegalDocumentPage
      title="Teacher Agreement"
      introduction="This agreement applies to every teacher using Amazing Skills to advertise services, accept bookings, sell courses, and receive direct student payments."
      sections={[
        {
          title: "1. Independent teacher relationship",
          paragraphs: [
            "You provide teaching services independently and are not an employee, agent, partner, or representative of Amazing Skills. You control your lawful teaching methods, availability, rates, content, and business obligations within platform rules.",
            "You are responsible for your registrations, taxes, insurance, permits, qualifications, and compliance with laws applying to your teaching business and students.",
          ],
        },
        {
          title: "2. Accuracy, qualifications, and conduct",
          paragraphs: [
            "You must provide truthful profile, qualification, experience, rate, availability, and payment information. Approval or verification by Amazing Skills is limited platform moderation and is not a government license or guarantee.",
            "You must treat students professionally, deliver booked services, protect confidential information, avoid discrimination and harassment, and comply with safety and acceptable-use rules.",
          ],
        },
        {
          title: "3. Merchant-of-record responsibility",
          paragraphs: [
            "Student lesson and course payments go directly to your connected payment account. You are the merchant of record and are responsible for transaction records, taxes, payment-provider compliance, chargebacks, and student refunds.",
            "Amazing Skills does not receive, hold, settle, or pay out these funds and takes no commission. Your separate platform subscription does not transfer financial responsibility for student transactions to Amazing Skills.",
          ],
        },
        {
          title: "4. Refund obligations",
          paragraphs: [
            "You agree to follow the current Refund and Direct Payment Policy and applicable consumer law, respond to requests promptly, issue approved refunds from your own payment account, and provide a truthful provider reference.",
            "You agree to participate in good-faith mediation, preserve relevant records, and respond to reasonable admin questions. Amazing Skills may sanction your account but is not required to fund or guarantee a refund.",
          ],
        },
        {
          title: "5. Course content and intellectual property",
          paragraphs: [
            "You must own or hold sufficient rights to every uploaded video, image, file, assessment, name, and other course resource. You grant Amazing Skills a non-exclusive license to host, process, display, deliver, promote, back up, and technically adapt content for platform operation.",
            "You remain responsible for course accuracy, promised updates, student support, lawful advertising, and honoring access and refund representations.",
          ],
        },
        {
          title: "6. Subscription and platform limits",
          paragraphs: [
            "Your selected subscription controls platform features and limits. You authorize recurring PayFast billing according to the selected interval until cancellation takes effect. Failed or cancelled subscriptions may restrict features after the published grace process.",
          ],
        },
        {
          title: "7. Review, suspension, and termination",
          paragraphs: [
            "Amazing Skills may review reports and evidence and may warn, restrict, suspend, delist, or terminate a teacher for safety risks, fraud, repeated refund non-compliance, misleading information, unlawful content, or material breach.",
            "Where appropriate, you will receive the reason, an opportunity to respond, and an appeal route. Immediate temporary restrictions may be used where reasonably needed to protect users or evidence.",
          ],
        },
        {
          title: "8. Updates and governing law",
          paragraphs: [
            "Material agreement updates are versioned and require renewed acceptance. South African law governs this agreement, subject to mandatory law that applies in another jurisdiction.",
          ],
        },
      ]}
    />
  );
}
