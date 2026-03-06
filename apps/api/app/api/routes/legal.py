from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from app.legal_content import (
    build_public_legal_url,
    get_legal_document,
    ordered_legal_documents,
    render_legal_document_html,
    render_legal_index_html,
)

router = APIRouter(tags=["legal"])
api_router = APIRouter(prefix="/legal", tags=["legal"])


class LegalSectionResponse(BaseModel):
    heading: str
    paragraphs: list[str]
    bullets: list[str]


class LegalDocumentSummaryResponse(BaseModel):
    slug: str
    title: str
    summary: str
    version: str
    requires_acceptance: bool
    public_url: str


class LegalDocumentResponse(LegalDocumentSummaryResponse):
    sections: list[LegalSectionResponse]


def _public_base_url(request: Request) -> str:
    return str(request.base_url).rstrip("/")


def _serialize_document_summary(request: Request, slug: str) -> LegalDocumentSummaryResponse:
    document = get_legal_document(slug)
    if not document:
        raise HTTPException(status_code=404, detail="Legal document not found")
    return LegalDocumentSummaryResponse(
        slug=document.slug,
        title=document.title,
        summary=document.summary,
        version=document.version,
        requires_acceptance=document.requires_acceptance,
        public_url=build_public_legal_url(_public_base_url(request), document.slug),
    )


@api_router.get("/documents", response_model=list[LegalDocumentSummaryResponse])
def list_legal_documents(request: Request) -> list[LegalDocumentSummaryResponse]:
    return [_serialize_document_summary(request, document.slug) for document in ordered_legal_documents()]


@api_router.get("/documents/{slug}", response_model=LegalDocumentResponse)
def get_legal_document_detail(slug: str, request: Request) -> LegalDocumentResponse:
    document = get_legal_document(slug)
    if not document:
        raise HTTPException(status_code=404, detail="Legal document not found")

    summary = _serialize_document_summary(request, slug)
    return LegalDocumentResponse(
        **summary.model_dump(),
        sections=[
            LegalSectionResponse(
                heading=section.heading,
                paragraphs=list(section.paragraphs),
                bullets=list(section.bullets),
            )
            for section in document.sections
        ],
    )


@router.get("/legal", response_class=HTMLResponse)
def legal_index(request: Request) -> HTMLResponse:
    return HTMLResponse(render_legal_index_html(_public_base_url(request)))


@router.get("/legal/{slug}", response_class=HTMLResponse)
def legal_document_page(slug: str, request: Request) -> HTMLResponse:
    document = get_legal_document(slug)
    if not document:
        raise HTTPException(status_code=404, detail="Legal document not found")
    return HTMLResponse(render_legal_document_html(document, _public_base_url(request)))
