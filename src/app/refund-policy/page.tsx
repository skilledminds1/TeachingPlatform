import type { Metadata } from "next";

import { LegalDocumentPage } from "@/features/legal/components/legal-document-page";

export const metadata: Metadata = { title: "Refund and Direct Payment Policy" };

export default function RefundPolicyPage() {
  return (
    <LegalDocumentPage
      title="Refund and Direct Payment Policy"
      introduction="This policy explains the separation between teacher payments and Amazing Skills subscriptions, the standard refund expectations for teachers, and the platform’s limited mediation role."
      sections={[
        {
          title: "1. Teachers receive student payments directly",
          paragraphs: [
            "Lesson and course payments are made from the student to the teacher through the teacher’s connected payment account. The teacher is the merchant of record. Amazing Skills does not receive, hold, settle, or pay out those funds and takes no commission.",
            "PayFast payments for teacher platform subscriptions are separate transactions between the subscribing organization and Amazing Skills.",
          ],
        },
        {
          title: "2. Standard lesson refund expectation",
          paragraphs: [
            "A student cancellation made at least 24 hours before the scheduled lesson should receive a full refund from the teacher. A teacher who cancels a paid lesson should provide a full refund regardless of notice unless the parties agree in writing to reschedule instead.",
            "For cancellations with less than 24 hours’ notice, completed lessons, or no-shows, the teacher may decide whether a refund is appropriate, subject to applicable law and any written agreement with the student.",
          ],
        },
        {
          title: "3. Standard course refund expectation",
          paragraphs: [
            "A paid self-paced course should be refunded by the teacher when the student requests it within 7 days of purchase and has completed less than 20% of the course.",
            "Outside that window or progress threshold, the teacher may consider the circumstances and applicable consumer law. Free enrollments do not have a refundable payment.",
          ],
        },
        {
          title: "4. Request and teacher response",
          paragraphs: [
            "Students should submit the platform refund request with a clear reason. Teachers should respond promptly, explain approval or decline, issue approved refunds through their own payment account, and record the provider reference.",
            "A platform status or teacher-entered reference is a record of the parties’ communication. Provider webhooks may separately reconcile confirmed refund activity.",
          ],
        },
        {
          title: "5. Amazing Skills mediation",
          paragraphs: [
            "If the parties disagree, the student may request admin mediation. Amazing Skills may create a shared case conversation, review evidence, request responses, and record an outcome.",
            "Amazing Skills cannot debit the teacher, reverse a teacher transaction, reimburse the student from platform funds, or guarantee that a refund will be paid. Mediation does not make Amazing Skills financially responsible for the underlying transaction.",
          ],
        },
        {
          title: "6. Teacher accountability",
          paragraphs: [
            "A teacher who repeatedly ignores valid requests, misrepresents payment activity, or fails to meet marketplace obligations may be warned, suspended, delisted, or removed after review and an opportunity to respond.",
            "Account action is a marketplace remedy, not a substitute for payment-provider disputes, chargeback rights, courts, regulators, or other remedies available under applicable law.",
          ],
        },
        {
          title: "7. Non-waivable rights",
          paragraphs: [
            "Nothing in this policy removes consumer, payment-provider, or statutory rights that cannot legally be waived. Where mandatory law gives a student greater protection, that law prevails.",
          ],
        },
      ]}
    />
  );
}
