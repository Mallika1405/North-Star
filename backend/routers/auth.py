from fastapi import APIRouter, HTTPException, Depends, status
from models.schemas import UserSignup, UserLogin, TokenResponse
from utils.supabase_client import get_supabase
from utils.auth import get_current_user
import logging

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(data: UserSignup):
    """
    Register a new user via Supabase Auth.
    Also creates a users table row for extended profile data.
    """
    supabase = get_supabase()

    try:
        # Create auth user
        response = supabase.auth.sign_up({
            "email": data.email,
            "password": data.password,
        })

        if not response.user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Signup failed. Email may already be registered.",
            )

        user_id = response.user.id

        # Insert into our users table with preferred language
        supabase.table("users").upsert({
            "id": user_id,
            "email": data.email,
            "preferred_language": data.preferred_language,
        }).execute()

        # Get session token
        token = response.session.access_token if response.session else ""

        return TokenResponse(access_token=token, user_id=user_id)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Signup error: {e}")
        raise HTTPException(status_code=500, detail="Signup failed. Please try again.")


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin):
    """Authenticate and return session token."""
    supabase = get_supabase()

    try:
        response = supabase.auth.sign_in_with_password({
            "email": data.email,
            "password": data.password,
        })

        if not response.user or not response.session:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password.",
            )

        return TokenResponse(
            access_token=response.session.access_token,
            user_id=response.user.id,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {e}")
        raise HTTPException(status_code=401, detail="Login failed.")


@router.post("/logout")
async def logout(user: dict = Depends(get_current_user)):
    """Invalidate the current session."""
    supabase = get_supabase()
    try:
        supabase.auth.sign_out()
        return {"message": "Logged out successfully."}
    except Exception as e:
        logger.error(f"Logout error: {e}")
        return {"message": "Logged out."}


@router.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    """Return current user info and preferred language."""
    supabase = get_supabase()
    result = supabase.table("users").select(
        "id, email, preferred_language, created_at"
    ).eq("id", user["user_id"]).single().execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="User not found.")

    return result.data
