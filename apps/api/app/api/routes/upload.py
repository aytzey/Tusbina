from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.auth import CurrentUser, get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.db.models import UploadAssetModel
from app.models.schemas import UploadAssetOut, UploadOut
from app.services.storage import get_storage_client

router = APIRouter(tags=["upload"])
UploadFiles = Annotated[list[UploadFile], File(...)]


@router.post("/upload", response_model=UploadOut)
async def upload_pdf(
    files: UploadFiles,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> UploadOut:
    if len(files) > settings.upload_max_files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"En fazla {settings.upload_max_files} dosya yükleyebilirsiniz",
        )

    storage = get_storage_client()
    allowed_extensions = {
        ext.strip().lower().lstrip(".") for ext in settings.upload_allowed_extensions.split(",") if ext.strip()
    }
    max_size_bytes = settings.upload_max_file_size_mb * 1024 * 1024

    assets: list[UploadAssetOut] = []
    file_ids: list[str] = []
    file_names: list[str] = []

    for file in files:
        filename = file.filename or "upload.bin"
        ext = Path(filename).suffix.lower().lstrip(".")
        if allowed_extensions and ext not in allowed_extensions:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Desteklenmeyen dosya uzantısı: {Path(filename).suffix or 'bilinmiyor'}. Desteklenen: PDF, Word, PowerPoint, metin dosyası",
            )

        raw = await file.read()
        if settings.upload_validate_pdf_signature and ext == "pdf":
            if not raw.lstrip().startswith(b"%PDF-"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Geçersiz PDF dosyası",
                )
        if len(raw) > max_size_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail=f"Dosya boyutu limiti aşıldı (max {settings.upload_max_file_size_mb} MB)",
            )

        stored = storage.save_bytes(
            filename=filename,
            content=raw,
            content_type=file.content_type or "application/octet-stream",
            user_id=current_user.user_id,
        )
        db.add(
            UploadAssetModel(
                id=stored.asset_id,
                user_id=current_user.user_id,
                filename=stored.filename,
                content_type=stored.content_type,
                size_bytes=stored.size_bytes,
                storage_key=stored.storage_key,
                public_url=stored.public_url,
            )
        )
        file_names.append(stored.filename)
        file_ids.append(stored.asset_id)
        assets.append(UploadAssetOut(id=stored.asset_id, filename=stored.filename, public_url=stored.public_url))

    db.commit()

    return UploadOut(ok=True, files=file_names, file_ids=file_ids, assets=assets)
