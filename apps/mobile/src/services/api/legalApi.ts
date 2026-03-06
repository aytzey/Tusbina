import { apiRequest } from "./httpClient";
import {
  ApiDeleteAccountResponse,
  ApiLegalConsent,
  ApiLegalConsentUpdateRequest,
  ApiLegalDocument,
  ApiLegalDocumentSummary,
} from "./types";

export async function fetchLegalDocuments(): Promise<ApiLegalDocumentSummary[]> {
  return apiRequest<ApiLegalDocumentSummary[]>("/legal/documents", { method: "GET" });
}

export async function fetchLegalDocument(slug: string): Promise<ApiLegalDocument> {
  return apiRequest<ApiLegalDocument>(`/legal/documents/${encodeURIComponent(slug)}`, { method: "GET" });
}

export async function fetchMyLegalConsent(): Promise<ApiLegalConsent> {
  return apiRequest<ApiLegalConsent>("/auth/legal-consent", { method: "GET" });
}

export async function updateMyLegalConsent(payload: ApiLegalConsentUpdateRequest): Promise<ApiLegalConsent> {
  return apiRequest<ApiLegalConsent>("/auth/legal-consent", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteMyAccount(): Promise<ApiDeleteAccountResponse> {
  return apiRequest<ApiDeleteAccountResponse>("/auth/account", { method: "DELETE" });
}
