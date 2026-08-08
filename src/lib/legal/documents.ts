import type { RegisterRole } from "@/lib/validations/auth";

export const CURRENT_LEGAL_DOCUMENTS = {
  terms: {
    id: "00000000-0000-4000-8000-000000000201",
    type: "terms",
    version: "2.0",
    title: "Terms of Service",
    path: "/terms",
    audience: "all",
  },
  privacy: {
    id: "00000000-0000-4000-8000-000000000202",
    type: "privacy",
    version: "2.0",
    title: "Privacy Policy",
    path: "/privacy",
    audience: "all",
  },
  refundPolicy: {
    id: "00000000-0000-4000-8000-000000000203",
    type: "refund_policy",
    version: "2.0",
    title: "Refund and Direct Payment Policy",
    path: "/refund-policy",
    audience: "all",
  },
  teacherAgreement: {
    id: "00000000-0000-4000-8000-000000000204",
    type: "teacher_agreement",
    version: "2.0",
    title: "Teacher Agreement",
    path: "/teacher-agreement",
    audience: "teacher",
  },
} as const;

export type CurrentLegalDocument =
  (typeof CURRENT_LEGAL_DOCUMENTS)[keyof typeof CURRENT_LEGAL_DOCUMENTS];

export function currentLegalDocumentsForRole(role: RegisterRole): CurrentLegalDocument[] {
  const common = [
    CURRENT_LEGAL_DOCUMENTS.terms,
    CURRENT_LEGAL_DOCUMENTS.privacy,
    CURRENT_LEGAL_DOCUMENTS.refundPolicy,
  ];
  return role === "teacher"
    ? [...common, CURRENT_LEGAL_DOCUMENTS.teacherAgreement]
    : common;
}
