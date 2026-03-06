import type { User } from "@supabase/supabase-js";

export type LegalDocumentId =
  | "privacy-policy"
  | "terms-of-use"
  | "kvkk-notice"
  | "data-processing-and-permissions"
  | "marketing-consent"
  | "account-deletion";

export interface LegalAcceptanceMetadata {
  privacy_policy_version?: string;
  terms_of_use_version?: string;
  kvkk_notice_version?: string;
  accepted_at?: string;
  marketing_opt_in?: boolean;
  marketing_consent_version?: string | null;
  marketing_consent_updated_at?: string | null;
}

export const LEGAL_DOCUMENT_VERSIONS = {
  privacyPolicy: "2026-03-06",
  termsOfUse: "2026-03-06",
  kvkkNotice: "2026-03-06",
  marketingConsent: "2026-03-06",
} as const;

export const LEGAL_DOCUMENT_LINKS: {
  id: LegalDocumentId;
  title: string;
  summary: string;
  required?: boolean;
}[] = [
  {
    id: "privacy-policy",
    title: "Gizlilik Politikası",
    summary: "Toplanan veriler, amaçlar, saklama ve silme süreçleri.",
    required: true,
  },
  {
    id: "terms-of-use",
    title: "Kullanım Koşulları",
    summary: "Hizmetin kullanım kuralları ve kullanıcı sorumlulukları.",
    required: true,
  },
  {
    id: "kvkk-notice",
    title: "KVKK Aydınlatma Metni",
    summary: "KVKK kapsamındaki işleme amaçları, hukuki sebepler ve haklar.",
    required: true,
  },
  {
    id: "data-processing-and-permissions",
    title: "Veri İşleme ve İzin Bilgilendirmesi",
    summary: "Dosya seçici, oturum açma ve çevrimdışı depolama açıklamaları.",
  },
  {
    id: "marketing-consent",
    title: "Açık Rıza ve İletişim Tercihi",
    summary: "Opsiyonel ürün duyurusu ve iletişim izni kapsamı.",
  },
  {
    id: "account-deletion",
    title: "Hesap Silme ve Veri Talepleri",
    summary: "Uygulama içi hesap silme ve veri kaldırma akışının kapsamı.",
  },
];

export function getLegalAcceptance(user: User | null | undefined): LegalAcceptanceMetadata | null {
  const raw = user?.user_metadata?.legal_acceptance;
  if (!raw || typeof raw !== "object") {
    return null;
  }
  return raw as LegalAcceptanceMetadata;
}

export function hasAcceptedRequiredLegal(user: User | null | undefined): boolean {
  const acceptance = getLegalAcceptance(user);
  if (!acceptance?.accepted_at) {
    return false;
  }

  return (
    acceptance.privacy_policy_version === LEGAL_DOCUMENT_VERSIONS.privacyPolicy &&
    acceptance.terms_of_use_version === LEGAL_DOCUMENT_VERSIONS.termsOfUse &&
    acceptance.kvkk_notice_version === LEGAL_DOCUMENT_VERSIONS.kvkkNotice
  );
}
