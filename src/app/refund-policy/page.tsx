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
            "Lesson payments are made from the student to the teacher through the teacher’s connected payment account. The teacher is the merchant of record. Amazing Skills does not receive, hold, settle, or pay out those funds and takes no commission.",
            "Because the platform never holds the money, every refund is issued by the teacher from that same payment account. Amazing Skills has nothing to refund from and cannot return a payment on a teacher’s behalf.",
            "Teacher platform subscriptions are sold by Paddle.com Market Ltd as merchant of record, so the subscription purchase is a transaction between the subscribing organization and Paddle rather than with Amazing Skills directly. Refund requests for a subscription may be raised with us or with Paddle; Paddle issues any refund to the original payment method.",
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
          title: "3. Request and teacher response",
          paragraphs: [
            "Students should submit the platform refund request with a clear reason. Teachers should respond promptly, explain approval or decline, issue approved refunds through their own payment account, and record the provider reference.",
            "A platform status or teacher-entered reference is a record of the parties’ communication. Provider webhooks may separately reconcile confirmed refund activity.",
          ],
        },
        {
          title: "4. Amazing Skills mediation",
          paragraphs: [
            "If the parties disagree, the student may request admin mediation. Amazing Skills may create a shared case conversation, review evidence, request responses, and record an outcome.",
            "Amazing Skills cannot debit the teacher, reverse a teacher transaction, reimburse the student from platform funds, or guarantee that a refund will be paid. Mediation does not make Amazing Skills financially responsible for the underlying transaction.",
          ],
        },
        {
          title: "5. Teacher accountability",
          paragraphs: [
            "A teacher who repeatedly ignores valid requests, misrepresents payment activity, or fails to meet marketplace obligations may be warned, suspended, delisted, or removed after review and an opportunity to respond.",
            "Account action is a marketplace remedy, not a substitute for payment-provider disputes, chargeback rights, courts, regulators, or other remedies available under applicable law.",
          ],
        },
        {
          title: "6. Non-waivable rights",
          paragraphs: [
            "Nothing in this policy removes consumer, payment-provider, or statutory rights that cannot legally be waived. Where mandatory law gives a student greater protection, that law prevails.",
          ],
        },
      ]}
    />
  );
}
