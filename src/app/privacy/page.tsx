import type { Metadata } from "next";

import { LegalDocumentPage } from "@/features/legal/components/legal-document-page";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalDocumentPage
      title="Privacy Policy"
      introduction="This policy explains how Amazing Skills processes personal information under South Africa’s POPIA and, where applicable, the GDPR and other mandatory privacy laws."
      sections={[
        {
          title: "1. Information we collect",
          paragraphs: ["We collect information you provide, information created through platform use, and limited technical information needed to operate and secure the service."],
          bullets: [
            "Account details, role, profile photo, timezone, and contact information.",
            "Teacher biographies, rates, subjects, qualifications, introduction media, availability, and payment-account connection status.",
            "Bookings, messages, reviews, reports, refund requests, and moderation records.",
            "Subscription and transaction references. Student-to-teacher payment card or wallet credentials are handled by the payment provider, not stored by Amazing Skills.",
            "Security logs, device/browser data, approximate network information, and versioned legal acceptance evidence.",
          ],
        },
        {
          title: "2. Why we process information",
          paragraphs: [
            "We process information to provide contracts and requested services, operate the marketplace, confirm payments, deliver lessons, prevent fraud and abuse, comply with law, protect users, and improve reliable platform operation.",
            "Optional marketing, transcription, analytics, or product-improvement processing is kept separate from mandatory account and transaction processing and is based on an appropriate legal ground or consent where required.",
          ],
        },
        {
          title: "3. Sharing and processors",
          paragraphs: [
            "We share only what is necessary with the student or teacher involved in a transaction and with service providers such as Supabase, hosting, LiveKit, Resend, Google, PayPal, and PayFast. These providers process data under their own terms and applicable safeguards.",
            "We may disclose information where required by law, to protect safety or legal rights, or during a legitimate business transfer with appropriate safeguards.",
          ],
        },
        {
          title: "4. Cross-border processing and security",
          paragraphs: [
            "Some providers may process information outside South Africa. We use appropriate contractual and technical safeguards where required, while recognizing that no online system can guarantee absolute security.",
            "Sensitive evidence and qualification materials should be held in private storage with controlled, time-limited access and audit records.",
          ],
        },
        {
          title: "5. Retention",
          paragraphs: [
            "We retain active account data while needed to provide the service. After deletion, we remove or anonymize information that is no longer required, while retaining financial, legal acceptance, audit, fraud, safety, and dispute records for applicable statutory or legitimate retention periods.",
          ],
        },
        {
          title: "6. Your rights",
          paragraphs: [
            "Depending on applicable law, you may request access, correction, deletion, restriction, objection, portability, consent withdrawal, or information about processing. We may verify identity and may retain information where law or overriding legitimate grounds require it.",
            "South African users may complain to the Information Regulator. EEA or UK users may contact their competent supervisory authority. Contact the Information Officer address below to exercise a right.",
          ],
        },
        {
          title: "7. Children",
          paragraphs: [
            "Students under 18 may use Amazing Skills with the permission of a parent or legal guardian. Teachers must be adults.",
            "Section 35 of POPIA requires the consent of a competent person before a child's personal information is processed, and treats a child as anyone under 18. Article 8 of the GDPR sets a lower threshold, between 13 and 16 depending on the member state. We apply the stricter rule to everyone: under 18 requires guardian permission regardless of where the student lives.",
            "We collect a date of birth at registration to decide which applies. Where the student is under 18, we email the parent or guardian they name, and the account cannot book a lesson until that person confirms on a page setting out what they are agreeing to. We record that confirmation, its date and time, the policy version in force, and a hashed form of the IP address and browser it came from — hashed so it evidences the act without becoming a second copy of the guardian's identity.",
            "Be clear about what this establishes: that a person controlling the named mailbox gave permission. We do not check identity documents and we do not verify the relationship. We do not carry out criminal record or background checks on teachers, and lessons are not recorded or monitored by us.",
            "A parent or guardian may withdraw permission at any time, which stops further bookings, and may exercise the access, correction and deletion rights in section 6 on the child's behalf.",
            "Material policy changes are versioned and may require renewed acknowledgement or acceptance before continued account use.",
          ],
        },
      ]}
    />
  );
}
