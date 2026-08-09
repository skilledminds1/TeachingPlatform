import type { Metadata } from "next";

import { LegalDocumentPage } from "@/features/legal/components/legal-document-page";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <LegalDocumentPage
      title="Terms of Service"
      introduction="These terms govern access to Amazing Skills, a marketplace and software platform connecting students with independent teachers for live one-to-one video lessons."
      sections={[
        {
          title: "1. Eligibility and accounts",
          paragraphs: [
            "Teachers must be at least 18 and legally capable of entering a contract. A teacher contracts directly with their students, is paid directly by them, and is responsible for their own tax position, so the account holder must be able to be bound by that.",
            "Students under 18 may hold an account with the permission of a parent or legal guardian. We ask for a date of birth at registration; where it is under 18, we email the parent or guardian named by the student and the account cannot book a lesson until that person confirms. Permission may be withdrawn at any time, which stops further bookings. This is confirmation by email, not identity verification — we do not check documents, and we do not verify that the person confirming is the child's guardian.",
            "Accounts are personal, and you must provide accurate information, protect your credentials, and promptly report unauthorized access.",
            "Students and teachers must accept the current Terms, Privacy Policy, and Refund and Direct Payment Policy. Teachers must also accept the Teacher Agreement.",
          ],
        },
        {
          title: "2. Marketplace role",
          paragraphs: [
            "Amazing Skills provides discovery, scheduling, communication, video, payment-connection, moderation, and related software. Teachers are independent service providers and are not employees, agents, partners, or representatives of Amazing Skills.",
            "The teaching contract is between the student and teacher. Amazing Skills does not guarantee a teacher’s availability, teaching outcome, qualification beyond the scope of platform verification, or suitability for a particular purpose.",
          ],
        },
        {
          title: "3. Payments and subscriptions",
          paragraphs: [
            "Students pay teachers directly through the teacher’s connected payment method. Amazing Skills does not receive, hold, settle, or pay out lesson funds and charges no commission on those transactions.",
            "Teacher platform subscriptions are sold by Paddle.com Market Ltd, which acts as the merchant of record and is the seller and party to that transaction. Paddle handles payment, invoicing, and any applicable sales tax or VAT, and their terms apply to the purchase itself. Prices are shown in US dollars and converted to your local currency at checkout. Subscription prices, billing intervals, renewals, cancellation timing, and plan limits are shown before you pay.",
          ],
        },
        {
          title: "4. Refunds and disputes",
          paragraphs: [
            "Teachers are responsible for deciding and issuing student refunds in accordance with the published Refund and Direct Payment Policy and applicable law. Amazing Skills cannot debit a teacher’s account, issue a student refund from platform funds, or guarantee reimbursement.",
            "Amazing Skills may record requests, facilitate a conversation, review evidence, and warn, suspend, delist, or remove a teacher who does not meet marketplace obligations. Mediation is not financial responsibility or a refund guarantee.",
          ],
        },
        {
          title: "5. Acceptable use and safety",
          paragraphs: [
            "You must not harass others, discriminate, impersonate, defraud, spam, share unlawful content, evade platform safeguards, misuse payment systems, or infringe intellectual property. Private lesson and messaging tools may be used only for legitimate educational activity.",
            "We may investigate reports, preserve relevant evidence, restrict features, suspend accounts, remove content, or terminate access where reasonably necessary for safety, legal compliance, payment risk, or platform integrity.",
          ],
        },
        {
          title: "6. Teacher content",
          paragraphs: [
            "Teachers retain ownership of original teaching content but grant Amazing Skills the rights needed to host, display, deliver, promote, back up, and technically process that content while it is offered through the platform.",
          ],
        },
        {
          title: "7. Availability, warranties, and liability",
          paragraphs: [
            "The platform is provided on an as-available basis. We work to maintain reliable service but cannot promise uninterrupted access or that every third-party service will remain available.",
            "To the maximum extent permitted by law, Amazing Skills is not liable for indirect or consequential loss, teacher conduct, educational outcomes, or funds paid directly to teachers. These terms do not exclude liability or consumer rights that cannot legally be excluded.",
          ],
        },
        {
          title: "8. Governing law and changes",
          paragraphs: [
            "These terms are governed by South African law, subject to mandatory rights that apply where a user resides. Disputes should first be raised with support so the parties can attempt good-faith resolution.",
            "We may update these terms for legal, safety, or product reasons. Material changes require renewed acceptance before continued account use.",
          ],
        },
      ]}
    />
  );
}
