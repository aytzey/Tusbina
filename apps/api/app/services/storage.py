from dataclasses import dataclass
from pathlib import Path
from typing import Protocol
from uuid import uuid4

import boto3
from fastapi import UploadFile
from pathvalidate import sanitize_filename

from app.core.config import settings


@dataclass
class StoredAsset:
    asset_id: str
    filename: str
    content_type: str
    size_bytes: int
    storage_key: str
    public_url: str


class StorageClient(Protocol):
    async def save_upload(self, file: UploadFile, *, user_id: str) -> StoredAsset: ...

    def save_bytes(self, filename: str, content: bytes, content_type: str, *, user_id: str) -> StoredAsset: ...

    def read_bytes(self, storage_key: str) -> bytes: ...


class LocalStorageClient:
    def __init__(self) -> None:
        self.base_dir = Path(settings.local_upload_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    async def save_upload(self, file: UploadFile, *, user_id: str) -> StoredAsset:
        raw = await file.read()
        return self.save_bytes(
            filename=file.filename or "upload.bin",
            content=raw,
            content_type=file.content_type or "application/octet-stream",
            user_id=user_id,
        )

    def save_bytes(self, filename: str, content: bytes, content_type: str, *, user_id: str) -> StoredAsset:
        safe_filename = sanitize_filename(filename or "upload.bin", platform="universal") or "upload.bin"
        asset_id = uuid4().hex
        key = f"{user_id}/{asset_id}-{safe_filename}"
        target = self.base_dir / key
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        return StoredAsset(
            asset_id=asset_id,
            filename=safe_filename,
            content_type=content_type,
            size_bytes=len(content),
            storage_key=key,
            public_url=f"{settings.public_upload_base_url}/{key}",
        )

    def read_bytes(self, storage_key: str) -> bytes:
        target = self.base_dir / storage_key
        return target.read_bytes()


class R2StorageClient:
    def __init__(self) -> None:
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.r2_endpoint,
            aws_access_key_id=settings.r2_access_key,
            aws_secret_access_key=settings.r2_secret_key,
        )

    async def save_upload(self, file: UploadFile, *, user_id: str) -> StoredAsset:
        raw = await file.read()
        return self.save_bytes(
            filename=file.filename or "upload.bin",
            content=raw,
            content_type=file.content_type or "application/octet-stream",
            user_id=user_id,
        )

    def save_bytes(self, filename: str, content: bytes, content_type: str, *, user_id: str) -> StoredAsset:
        safe_filename = sanitize_filename(filename or "upload.bin", platform="universal") or "upload.bin"
        asset_id = uuid4().hex
        key = f"{user_id}/{asset_id}-{safe_filename}"
        self.client.put_object(Bucket=settings.r2_bucket, Key=key, Body=content, ContentType=content_type)

        if settings.r2_public_base_url:
            public_url = f"{settings.r2_public_base_url.rstrip('/')}/{key}"
        else:
            public_url = f"{settings.r2_endpoint.rstrip('/')}/{settings.r2_bucket}/{key}"

        return StoredAsset(
            asset_id=asset_id,
            filename=safe_filename,
            content_type=content_type,
            size_bytes=len(content),
            storage_key=key,
            public_url=public_url,
        )

    def read_bytes(self, storage_key: str) -> bytes:
        response = self.client.get_object(Bucket=settings.r2_bucket, Key=storage_key)
        return response["Body"].read()


def get_storage_client() -> StorageClient:
    if settings.storage_backend.lower() == "r2":
        return R2StorageClient()
    return LocalStorageClient()
