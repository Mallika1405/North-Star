from fastapi import APIRouter, HTTPException, Depends, status
from models.schemas import BusinessProfileCreate, BusinessProfileUpdate, BusinessProfileResponse
from utils.supabase_client import get_supabase
from utils.auth import get_current_user
import logging

router = APIRouter(prefix="/profile", tags=["profile"])
logger = logging.getLogger(__name__)


@router.get("", response_model=BusinessProfileResponse | None)
async def get_profile(user: dict = Depends(get_current_user)):
    """Get the current user's business profile."""
    supabase = get_supabase()
    result = supabase.table("business_profiles").select("*").eq(
        "user_id", user["user_id"]
    ).execute()
    if result.data and len(result.data) > 0:
        return result.data[0]
    return None


@router.post("", response_model=BusinessProfileResponse, status_code=status.HTTP_201_CREATED)
async def create_profile(
    data: BusinessProfileCreate,
    user: dict = Depends(get_current_user),
):
    supabase = get_supabase()

    existing = supabase.table("business_profiles").select("id").eq(
        "user_id", user["user_id"]
    ).execute()

    if existing.data and len(existing.data) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Profile already exists. Use PUT to update.",
        )

    insert_data = {
        "user_id": user["user_id"],
        **data.model_dump(exclude_none=True),
    }

    result = supabase.table("business_profiles").insert(insert_data).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Profile creation failed.")

    return result.data[0]


@router.put("", response_model=BusinessProfileResponse)
async def update_profile(
    data: BusinessProfileUpdate,
    user: dict = Depends(get_current_user),
):
    supabase = get_supabase()

    update_data = data.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update.")

    result = supabase.table("business_profiles").update(update_data).eq(
        "user_id", user["user_id"]
    ).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Profile not found. Create one first.")

    return result.data[0]


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_profile(user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    supabase.table("business_profiles").delete().eq(
        "user_id", user["user_id"]
    ).execute()