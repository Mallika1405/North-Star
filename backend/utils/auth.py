from fastapi import HTTPException, Security, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from utils.supabase_client import get_supabase
import logging

logger = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Security(security),
) -> dict:
    """
    Validate the Bearer token via Supabase and return the user dict.
    Skips auth for OPTIONS preflight requests.
    Raises 401 if token is invalid or expired.
    """
    # Let OPTIONS preflight through
    if request.method == "OPTIONS":
        return {"user_id": None, "email": None, "token": None}

    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    token = credentials.credentials
    supabase = get_supabase()

    try:
        response = supabase.auth.get_user(token)
        if response is None or response.user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
            )
        return {"user_id": response.user.id, "email": response.user.email, "token": token}
    except Exception as e:
        logger.warning(f"Auth failure: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        )


def require_user(user: dict = Security(get_current_user)) -> dict:
    """Shorthand dependency for protected routes."""
    return user