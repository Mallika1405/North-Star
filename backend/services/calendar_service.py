"""
Google Calendar integration.
OAuth2 flow + event creation with user confirmation preview.
"""

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from config import settings
from utils.supabase_client import get_supabase
from datetime import date, datetime, timedelta
import json
import logging

logger = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/calendar.events"]

GRANT_CALENDAR_ID = "primary"

# Colors: Gemini Calendar color IDs
# 11 = Tomato (red) for hard deadlines
# 5 = Banana (yellow) for soft deadlines
# 2 = Sage (green) for completed
HARD_DEADLINE_COLOR = "11"   # Tomato
SOFT_DEADLINE_COLOR = "5"    # Banana


def get_oauth_flow() -> Flow:
    client_config = {
        "web": {
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uris": [settings.google_redirect_uri],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }
    flow = Flow.from_client_config(client_config, scopes=SCOPES)
    flow.redirect_uri = settings.google_redirect_uri
    return flow


def get_auth_url(state: str | None = None) -> str:
    """Generate Google OAuth authorization URL."""
    flow = get_oauth_flow()
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=state or "",
    )
    return auth_url


async def exchange_code_for_token(code: str, user_id: str) -> dict:
    """
    Exchange OAuth code for token, store in Supabase.
    Returns token dict.
    """
    flow = get_oauth_flow()
    flow.fetch_token(code=code)
    credentials = flow.credentials

    token_data = {
        "token": credentials.token,
        "refresh_token": credentials.refresh_token,
        "token_uri": credentials.token_uri,
        "client_id": credentials.client_id,
        "client_secret": credentials.client_secret,
        "scopes": list(credentials.scopes or []),
        "expiry": credentials.expiry.isoformat() if credentials.expiry else None,
    }

    # Store in Supabase
    supabase = get_supabase()
    supabase.table("users").update(
        {"google_calendar_token": json.dumps(token_data)}
    ).eq("id", user_id).execute()

    return token_data


async def get_calendar_service(user_id: str):
    """
    Build an authorized Google Calendar service for a user.
    Refreshes token if expired.
    Returns service or None if not connected.
    """
    supabase = get_supabase()
    result = supabase.table("users").select("google_calendar_token").eq("id", user_id).single().execute()

    if not result.data or not result.data.get("google_calendar_token"):
        return None

    token_data = result.data["google_calendar_token"]
    if isinstance(token_data, str):
        token_data = json.loads(token_data)

    expiry = None
    if token_data.get("expiry"):
        try:
            expiry = datetime.fromisoformat(token_data["expiry"])
        except ValueError:
            pass

    creds = Credentials(
        token=token_data.get("token"),
        refresh_token=token_data.get("refresh_token"),
        token_uri=token_data.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=token_data.get("client_id"),
        client_secret=token_data.get("client_secret"),
        scopes=token_data.get("scopes", SCOPES),
        expiry=expiry,
    )

    # Refresh if expired
    if creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
            # Save refreshed token
            token_data["token"] = creds.token
            token_data["expiry"] = creds.expiry.isoformat() if creds.expiry else None
            supabase.table("users").update(
                {"google_calendar_token": json.dumps(token_data)}
            ).eq("id", user_id).execute()
        except Exception as e:
            logger.error(f"Token refresh failed for user {user_id}: {e}")
            return None

    try:
        service = build("calendar", "v3", credentials=creds)
        return service
    except Exception as e:
        logger.error(f"Calendar service build failed: {e}")
        return None


def _build_calendar_event(event_preview: dict) -> dict:
    """
    Convert our CalendarEventPreview format to Google Calendar API event format.
    """
    start_date = event_preview["start_date"]
    if isinstance(start_date, str):
        start_date = date.fromisoformat(start_date)

    end_date = event_preview.get("end_date") or start_date
    if isinstance(end_date, str):
        end_date = date.fromisoformat(end_date)

    # Build description
    description_parts = [event_preview.get("description", "")]

    grants = event_preview.get("related_grant_names", [])
    if grants:
        description_parts.append(f"\n📋 Related applications: {', '.join(grants)}")

    source_url = event_preview.get("source_url")
    if source_url:
        description_parts.append(f"\n🔗 Source: {source_url}")

    if event_preview.get("is_hard_deadline"):
        description_parts.append("\n⚠️ HARD DEADLINE — submitted 3 days early as buffer.")

    description = "\n".join(description_parts)

    # Reminders: 1 week and 1 day before
    reminders = {
        "useDefault": False,
        "overrides": [
            {"method": "email", "minutes": 7 * 24 * 60},   # 1 week
            {"method": "popup", "minutes": 24 * 60},         # 1 day
        ],
    }

    color_id = HARD_DEADLINE_COLOR if event_preview.get("is_hard_deadline") else SOFT_DEADLINE_COLOR

    return {
        "summary": event_preview["title"],
        "description": description,
        "start": {"date": start_date.isoformat()},
        "end": {"date": (end_date + timedelta(days=1)).isoformat()},  # Google end is exclusive
        "colorId": color_id,
        "reminders": reminders,
        "source": {
            "title": "Business Advisor App",
            "url": source_url or "https://localhost:5173",
        },
    }


async def add_events_to_calendar(
    user_id: str,
    events: list[dict],
) -> dict:
    """
    Add a confirmed list of events to the user's Google Calendar.
    Returns {added: [event_ids], failed: [titles]}.
    """
    service = await get_calendar_service(user_id)
    if not service:
        return {
            "added": [],
            "failed": [e.get("title", "Unknown") for e in events],
            "error": "Google Calendar not connected. Please authorize in Settings.",
        }

    added = []
    failed = []

    for event_preview in events:
        try:
            calendar_event = _build_calendar_event(event_preview)
            result = service.events().insert(
                calendarId=GRANT_CALENDAR_ID,
                body=calendar_event,
            ).execute()

            event_id = result.get("id", "")
            added.append(event_id)

            # Update DB with calendar event ID
            supabase = get_supabase()
            task_id = event_preview.get("task_id")
            compliance_id = event_preview.get("compliance_event_id")

            if task_id:
                supabase.table("grant_tasks").update({
                    "google_calendar_event_id": event_id,
                    "calendar_added_at": datetime.utcnow().isoformat(),
                }).eq("id", str(task_id)).execute()

            elif compliance_id:
                supabase.table("compliance_events").update({
                    "google_calendar_event_id": event_id,
                    "calendar_added_at": datetime.utcnow().isoformat(),
                }).eq("id", str(compliance_id)).execute()

        except HttpError as e:
            logger.error(f"Calendar event creation failed: {e}")
            failed.append(event_preview.get("title", "Unknown"))
        except Exception as e:
            logger.error(f"Unexpected error adding calendar event: {e}")
            failed.append(event_preview.get("title", "Unknown"))

    return {"added": added, "failed": failed}


async def check_calendar_connected(user_id: str) -> bool:
    """Check if user has connected Google Calendar."""
    supabase = get_supabase()
    result = supabase.table("users").select("google_calendar_token").eq("id", user_id).single().execute()
    return bool(result.data and result.data.get("google_calendar_token"))
