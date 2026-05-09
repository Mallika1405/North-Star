"""
Grants router.
Live grant search, application tracking, task decomposition with cross-grant batching.
"""

from fastapi import APIRouter, HTTPException, Depends, status, BackgroundTasks
from models.schemas import (
    GrantSearchRequest, GrantSearchResponse,
    GrantApplicationCreate, GrantApplicationUpdate, GrantApplicationResponse,
    GrantTaskCreate, GrantTaskUpdate, GrantTaskResponse,
    CalendarEventPreview,
)
from utils.supabase_client import get_supabase
from utils.auth import get_current_user
from services.search_service import search_grants_live
from services.gemini_service import run_grant_search_analysis, decompose_grant_into_tasks
from datetime import date
import logging

router = APIRouter(prefix="/grants", tags=["grants"])
logger = logging.getLogger(__name__)


def _get_profile(supabase, user_id: str) -> dict | None:
    result = supabase.table("business_profiles").select("*").eq(
        "user_id", user_id
    ).maybe_single().execute()
    return result.data


# ============================================================
# GRANT SEARCH
# ============================================================

@router.post("/search", response_model=GrantSearchResponse)
async def search_grants(
    request: GrantSearchRequest,
    user: dict = Depends(get_current_user),
):
    """
    Live grant search using Tavily + Gemini analysis.
    Always fresh — no cached results.
    """
    supabase = get_supabase()
    profile = _get_profile(supabase, user["user_id"])

    if not profile:
        raise HTTPException(
            status_code=400,
            detail="Please complete your business profile before searching for grants.",
        )

    # Run live Tavily search
    try:
        search_data = await search_grants_live(
            profile=profile,
            additional_keywords=request.additional_keywords,
            override_industry=request.override_industry,
            override_stage=request.override_stage,
        )
    except Exception as e:
        logger.error(f"Grant search error for user {user['user_id']}: {e}")
        raise HTTPException(
            status_code=503,
            detail="Grant search temporarily unavailable. Please try again.",
        )

    # Format raw results for Gemini
    import json
    raw_text = json.dumps(search_data["raw_results"], indent=2)

    # Analyze with Gemini to get structured, personalized results
    analysis = await run_grant_search_analysis(
        search_results_raw=raw_text,
        profile=profile,
        language=request.language,
    )

    if "error" in analysis:
        logger.error(f"Grant analysis failed: {analysis['error']}")

    return GrantSearchResponse(
        results=analysis.get("results", []),
        search_note=(
            f"Searched live on {search_data['search_date']}. "
            f"Found {search_data['total_results_found']} sources. "
            "Verify deadlines and eligibility at the primary source before applying."
        ),
        sources_searched=search_data["sources_searched"][:10],
    )


# ============================================================
# GRANT APPLICATIONS CRUD
# ============================================================

@router.get("/applications", response_model=list[GrantApplicationResponse])
async def list_applications(
    status: str | None = None,
    user: dict = Depends(get_current_user),
):
    """List all grant applications, optionally filtered by status."""
    supabase = get_supabase()
    query = supabase.table("grant_applications").select("*").eq(
        "user_id", user["user_id"]
    ).order("created_at", desc=True)

    if status:
        query = query.eq("status", status)

    result = query.execute()
    return result.data or []


@router.post("/applications", response_model=GrantApplicationResponse, status_code=status.HTTP_201_CREATED)
async def create_application(
    data: GrantApplicationCreate,
    user: dict = Depends(get_current_user),
):
    """Track a new grant application."""
    supabase = get_supabase()
    insert_data = data.model_dump(exclude_none=True)
    # Convert date objects to ISO strings for Supabase
    if insert_data.get("submission_deadline"):
        insert_data["submission_deadline"] = str(insert_data["submission_deadline"])
    result = supabase.table("grant_applications").insert({
        "user_id": user["user_id"],
        **insert_data,
    }).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create application.")

    return result.data[0]


@router.get("/applications/{application_id}", response_model=GrantApplicationResponse)
async def get_application(
    application_id: str,
    user: dict = Depends(get_current_user),
):
    supabase = get_supabase()
    result = supabase.table("grant_applications").select("*").eq(
        "id", application_id
    ).eq("user_id", user["user_id"]).single().execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Application not found.")

    return result.data


@router.patch("/applications/{application_id}", response_model=GrantApplicationResponse)
async def update_application(
    application_id: str,
    data: GrantApplicationUpdate,
    user: dict = Depends(get_current_user),
):
    """Update application status, drafted content, or notes."""
    supabase = get_supabase()
    update_data = data.model_dump(exclude_none=True)

    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update.")

    result = supabase.table("grant_applications").update(update_data).eq(
        "id", application_id
    ).eq("user_id", user["user_id"]).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Application not found.")

    return result.data[0]


@router.delete("/applications/{application_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_application(
    application_id: str,
    user: dict = Depends(get_current_user),
):
    supabase = get_supabase()
    supabase.table("grant_applications").delete().eq(
        "id", application_id
    ).eq("user_id", user["user_id"]).execute()


# ============================================================
# GRANT TASK DECOMPOSITION
# ============================================================

@router.post("/applications/{application_id}/decompose-tasks", response_model=list[GrantTaskResponse])
async def decompose_tasks(
    application_id: str,
    user: dict = Depends(get_current_user),
):
    """
    Break a grant application into tasks with deadlines.
    Identifies shared document tasks across concurrent applications.
    Stores tasks in DB and returns them for calendar preview.
    """
    supabase = get_supabase()

    # Verify ownership and get grant details
    app_result = supabase.table("grant_applications").select("*").eq(
        "id", application_id
    ).eq("user_id", user["user_id"]).single().execute()

    if not app_result.data:
        raise HTTPException(status_code=404, detail="Application not found.")

    application = app_result.data

    # Get other in-progress applications for cross-grant batching
    other_apps_result = supabase.table("grant_applications").select(
        "id, grant_name, grant_provider, submission_deadline"
    ).eq("user_id", user["user_id"]).in_(
        "status", ["in_progress", "researching"]
    ).neq("id", application_id).execute()

    other_apps = other_apps_result.data or []

    # Get business profile
    profile = _get_profile(supabase, user["user_id"])

    # Generate tasks with Gemini
    deadline_str = None
    if application.get("submission_deadline"):
        deadline_str = str(application["submission_deadline"])

    tasks_raw = await decompose_grant_into_tasks(
        grant_name=application["grant_name"],
        grant_provider=application.get("grant_provider", "Unknown"),
        submission_deadline=deadline_str,
        existing_grants_in_progress=other_apps,
        profile=profile,
        language="en",  # task decomposition always in English (stored data)
    )

    if not tasks_raw:
        raise HTTPException(
            status_code=500,
            detail="Could not generate tasks. Please try again.",
        )

    # Resolve shared grant IDs from names
    grant_name_to_id = {a["grant_name"]: a["id"] for a in other_apps}

    # Store tasks
    stored_tasks = []
    for task_raw in tasks_raw:
        # Convert grant names to IDs for also_serves
        also_serves_ids = []
        for grant_name in task_raw.get("also_serves_grants", []):
            if grant_name in grant_name_to_id:
                also_serves_ids.append(grant_name_to_id[grant_name])

        insert_data = {
            "grant_application_id": application_id,
            "user_id": user["user_id"],
            "title": task_raw["title"],
            "description": task_raw.get("description"),
            "task_type": task_raw.get("task_type"),
            "soft_deadline": task_raw.get("soft_deadline"),
            "hard_deadline": task_raw.get("hard_deadline"),
            "is_hard_deadline": task_raw.get("is_hard_deadline", False),
            "also_serves_grant_ids": also_serves_ids,
        }

        result = supabase.table("grant_tasks").insert(insert_data).execute()
        if result.data:
            stored_tasks.append(result.data[0])

    # Update application status to in_progress
    supabase.table("grant_applications").update(
        {"status": "in_progress"}
    ).eq("id", application_id).execute()

    return stored_tasks


# ============================================================
# TASK CRUD
# ============================================================

@router.get("/applications/{application_id}/tasks", response_model=list[GrantTaskResponse])
async def get_tasks(
    application_id: str,
    user: dict = Depends(get_current_user),
):
    supabase = get_supabase()
    result = supabase.table("grant_tasks").select("*").eq(
        "grant_application_id", application_id
    ).eq("user_id", user["user_id"]).order("soft_deadline").execute()
    return result.data or []


@router.patch("/tasks/{task_id}", response_model=GrantTaskResponse)
async def update_task(
    task_id: str,
    data: GrantTaskUpdate,
    user: dict = Depends(get_current_user),
):
    supabase = get_supabase()
    update_data = data.model_dump(exclude_none=True)

    if data.is_completed:
        from datetime import datetime
        update_data["completed_at"] = datetime.utcnow().isoformat()

    result = supabase.table("grant_tasks").update(update_data).eq(
        "id", task_id
    ).eq("user_id", user["user_id"]).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Task not found.")

    return result.data[0]


# ============================================================
# CALENDAR PREVIEW
# Returns tasks formatted as calendar events for user confirmation
# before anything is added to Google Calendar.
# ============================================================

@router.get("/applications/{application_id}/calendar-preview", response_model=list[CalendarEventPreview])
async def get_calendar_preview(
    application_id: str,
    user: dict = Depends(get_current_user),
):
    """
    Return all pending tasks as calendar event previews.
    Frontend shows these for user confirmation before calling /calendar/add.
    """
    supabase = get_supabase()

    # Get this application's tasks that don't have calendar events yet
    tasks_result = supabase.table("grant_tasks").select("*").eq(
        "grant_application_id", application_id
    ).eq("user_id", user["user_id"]).is_(
        "google_calendar_event_id", "null"
    ).execute()

    tasks = tasks_result.data or []

    # Get grant name for labeling
    app_result = supabase.table("grant_applications").select(
        "grant_name, grant_url"
    ).eq("id", application_id).single().execute()
    app = app_result.data or {}

    # Also get names of grants this task also serves
    all_apps_result = supabase.table("grant_applications").select(
        "id, grant_name"
    ).eq("user_id", user["user_id"]).execute()
    id_to_name = {a["id"]: a["grant_name"] for a in (all_apps_result.data or [])}

    previews = []
    for task in tasks:
        deadline = task.get("hard_deadline") or task.get("soft_deadline")
        if not deadline:
            continue

        related_grants = [app.get("grant_name", "")]
        for gid in (task.get("also_serves_grant_ids") or []):
            name = id_to_name.get(str(gid))
            if name:
                related_grants.append(name)

        previews.append(CalendarEventPreview(
            title=task["title"],
            description=task.get("description") or task["title"],
            start_date=deadline,
            is_hard_deadline=task.get("is_hard_deadline", False),
            related_grant_names=[g for g in related_grants if g],
            source_url=app.get("grant_url"),
            task_id=task["id"],
        ))

    return previews