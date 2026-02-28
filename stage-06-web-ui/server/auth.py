"""Authentication module for VibeCoding Web Manager."""

import os
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

security = HTTPBearer(auto_error=False)

AUTH_TOKEN = os.environ.get("VIBE_AUTH_TOKEN", "vibecoding")


def verify_token(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> str:
    """Verify Bearer token from Authorization header.

    Returns the token string on success, raises 401 on failure.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if credentials.credentials != AUTH_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return credentials.credentials
