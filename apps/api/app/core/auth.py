import json
import logging
import threading
import time
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.core.config import settings

logger = logging.getLogger("tusbina-auth")

bearer = HTTPBearer(auto_error=False)

# ---------------------------------------------------------------------------
# JWKS cache -- fetched once from Supabase, refreshed every 6 hours
# ---------------------------------------------------------------------------
_jwks_cache: dict = {}
_jwks_lock = threading.Lock()
_jwks_fetched_at: float = 0.0
_JWKS_TTL_SEC = 6 * 60 * 60  # 6 hours


def _fetch_jwks() -> dict:
    """Fetch JWKS from Supabase's well-known endpoint."""
    url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
    req = Request(url, method="GET")
    try:
        with urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (URLError, HTTPError, TimeoutError, json.JSONDecodeError) as exc:
        logger.error("Failed to fetch JWKS from %s: %s", url, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to fetch authentication keys",
        ) from exc


def _get_jwks() -> dict:
    """Return cached JWKS, refreshing when stale."""
    global _jwks_cache, _jwks_fetched_at

    now = time.monotonic()
    if _jwks_cache and (now - _jwks_fetched_at) < _JWKS_TTL_SEC:
        return _jwks_cache

    with _jwks_lock:
        # Double-check after acquiring lock
        now = time.monotonic()
        if _jwks_cache and (now - _jwks_fetched_at) < _JWKS_TTL_SEC:
            return _jwks_cache

        jwks = _fetch_jwks()
        _jwks_cache = jwks
        _jwks_fetched_at = now
        logger.info("JWKS refreshed (%d keys)", len(jwks.get("keys", [])))
        return _jwks_cache


@dataclass
class CurrentUser:
    user_id: str
    email: str = ""


def _validate_supabase_token(token: str) -> CurrentUser:
    """Validate a Supabase JWT using the JWKS public keys."""
    jwks = _get_jwks()

    try:
        # Decode the token header to find the key id (kid)
        unverified_header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token header"
        ) from exc

    kid = unverified_header.get("kid")
    algorithm = unverified_header.get("alg", "RS256")

    # Find the matching key in JWKS
    rsa_key: dict = {}
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            rsa_key = key
            break

    if not rsa_key:
        # Key not found -- maybe JWKS rotated. Force refresh once.
        global _jwks_fetched_at
        _jwks_fetched_at = 0.0
        jwks = _get_jwks()
        for key in jwks.get("keys", []):
            if key.get("kid") == kid:
                rsa_key = key
                break

    if not rsa_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token signing key not found",
        )

    try:
        payload = jwt.decode(
            token,
            rsa_key,
            algorithms=[algorithm],
            audience=settings.supabase_jwt_audience,
            options={"verify_aud": bool(settings.supabase_jwt_audience)},
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        ) from exc

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing sub"
        )

    email = payload.get("email", "")
    return CurrentUser(user_id=str(user_id), email=str(email))


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    x_user_id: str | None = Header(default=None),
) -> CurrentUser:
    if not settings.enable_auth:
        return CurrentUser(user_id=x_user_id or settings.default_user_id)

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token"
        )

    return _validate_supabase_token(credentials.credentials)
