"""
Calendar router.
Google OAuth flow + confirmed event creation.
Events are only added after user confirms the preview.
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import RedirectResponse
from models.schemas import CalendarConfirmRequest, CalendarAddResponse, GoogleAuthURL
from utils.auth import get_current_user
from services.calendar_service import (
    get_auth_url,
    exchange_code_for_token,
    add_events_to_calendar,
    check_calendar_connected,
)
from config import settings
import logging

router = APIRouter(prefix="/calendar", tags=["calendar"])
logger = logging.getLogger(__name__)


@router.get("/status")
async def calendar_status(user: dict = Depends(get_current_user)):
    """Check if the user has connected Google Calendar."""
    connected = await check_calendar_connected(user["user_id"])
    return {"connected": connected}


@router.get("/auth-url", response_model=GoogleAuthURL)
async def get_google_auth_url(referrer: str = "settings", user: dict = Depends(get_current_user)):
    """
    Generate the Google OAuth URL for calendar authorization.
    Frontend opens this URL for the user to approve calendar access.
    """
    # Encode user_id and referrer in state: "user_id|referrer"
    state = f"{user['user_id']}|{referrer}"
    auth_url = get_auth_url(state=state)
    return GoogleAuthURL(auth_url=auth_url)


@router.get("/callback")
async def google_oauth_callback(
    request: Request,
    code: str,
    state: str | None = None,
):
    """
    Google OAuth callback. Exchanges code for token and redirects to frontend.
    State contains "user_id|referrer".
    """
    if not state:
        raise HTTPException(status_code=400, detail="Missing state parameter.")

    # Parse state: "user_id" or "user_id|referrer"
    parts = state.split("|")
    user_id = parts[0]
    referrer = parts[1] if len(parts) > 1 else "settings"

    try:
        await exchange_code_for_token(code=code, user_id=user_id)
        frontend_url = settings.cors_origins_list[0]
        redirect_path = "/applications" if referrer == "applications" else "/settings"
        return RedirectResponse(url=f"{frontend_url}{redirect_path}?calendar=connected")
    except Exception as e:
        logger.error(f"OAuth callback error for user {user_id}: {e}")
        frontend_url = settings.cors_origins_list[0]
        return RedirectResponse(url=f"{frontend_url}/applications?calendar=error")


@router.post("/add-events", response_model=CalendarAddResponse)
async def add_confirmed_events(
    data: CalendarConfirmRequest,
    user: dict = Depends(get_current_user),
):
    """
    Add confirmed events to Google Calendar.
    Only called AFTER the user has reviewed the preview and clicked confirm.
    Each event includes what it is, which grants it serves, and links to sources.
    """
    if not data.events_to_add:
        return CalendarAddResponse(added=[], failed=[])

    connected = await check_calendar_connected(user["user_id"])
    if not connected:
        raise HTTPException(
            status_code=400,
            detail="Google Calendar not connected. Use /calendar/auth-url to connect.",
        )

    events_dicts = [e.model_dump() for e in data.events_to_add]

    result = await add_events_to_calendar(
        user_id=user["user_id"],
        events=events_dicts,
    )

    return CalendarAddResponse(
        added=result.get("added", []),
        failed=result.get("failed", []),
    )


@router.get("/upcoming")
async def get_upcoming_deadlines(
    days_ahead: int = 30,
    user: dict = Depends(get_current_user),
):
    """
    Return upcoming grant task deadlines and compliance events
    as a unified calendar view. Sorted by date.
    """
    from utils.supabase_client import get_supabase
    from datetime import date, timedelta

    supabase = get_supabase()
    today = date.today().isoformat()
    cutoff = (date.today() + timedelta(days=days_ahead)).isoformat()

    # Grant task deadlines
    tasks_result = supabase.table("grant_tasks").select(
        "id, title, soft_deadline, hard_deadline, is_hard_deadline, is_completed, grant_application_id"
    ).eq("user_id", user["user_id"]).eq("is_completed", False).or_(
        f"soft_deadline.gte.{today},hard_deadline.gte.{today}"
    ).execute()

    # Compliance events
    compliance_result = supabase.table("compliance_events").select("*").eq(
        "user_id", user["user_id"]
    ).eq("is_dismissed", False).gte("due_date", today).lte(
        "due_date", cutoff
    ).execute()

    events = []

    for task in (tasks_result.data or []):
        deadline = task.get("hard_deadline") or task.get("soft_deadline")
        if deadline and today <= deadline <= cutoff:
            events.append({
                "type": "grant_task",
                "title": task["title"],
                "date": deadline,
                "is_hard_deadline": task.get("is_hard_deadline", False),
                "task_id": task["id"],
                "grant_application_id": task["grant_application_id"],
            })

    for ce in (compliance_result.data or []):
        events.append({
            "type": "compliance",
            "title": ce["title"],
            "date": ce["due_date"],
            "event_type": ce.get("event_type"),
            "compliance_event_id": ce["id"],
        })

    # Sort by date
    events.sort(key=lambda x: x["date"])

    return {"events": events, "period_days": days_ahead}