"""
Compliance events router.
Tax deadlines, license renewals, LLC annual reports — anything time-sensitive and recurring.
"""

from fastapi import APIRouter, HTTPException, Depends, status
from models.schemas import ComplianceEventCreate, ComplianceEventResponse
from utils.supabase_client import get_supabase
from utils.auth import get_current_user
from datetime import date

router = APIRouter(prefix="/compliance", tags=["compliance"])


def _get_profile(supabase, user_id: str) -> dict | None:
    result = supabase.table("business_profiles").select("*").eq(
        "user_id", user_id
    ).maybe_single().execute()
    return result.data


@router.get("", response_model=list[ComplianceEventResponse])
async def list_compliance_events(
    upcoming_only: bool = True,
    user: dict = Depends(get_current_user),
):
    """List compliance events. Defaults to upcoming only."""
    supabase = get_supabase()
    query = supabase.table("compliance_events").select("*").eq(
        "user_id", user["user_id"]
    ).eq("is_dismissed", False).order("due_date")

    if upcoming_only:
        today = date.today().isoformat()
        query = query.gte("due_date", today)

    result = query.execute()
    return result.data or []


@router.post("", response_model=ComplianceEventResponse, status_code=status.HTTP_201_CREATED)
async def create_compliance_event(
    data: ComplianceEventCreate,
    user: dict = Depends(get_current_user),
):
    supabase = get_supabase()
    result = supabase.table("compliance_events").insert({
        "user_id": user["user_id"],
        **data.model_dump(exclude_none=True),
    }).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create compliance event.")

    return result.data[0]


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def dismiss_compliance_event(
    event_id: str,
    user: dict = Depends(get_current_user),
):
    """Dismiss (soft-delete) a compliance event."""
    supabase = get_supabase()
    supabase.table("compliance_events").update({"is_dismissed": True}).eq(
        "id", event_id
    ).eq("user_id", user["user_id"]).execute()


@router.post("/seed-tax-deadlines", response_model=list[ComplianceEventResponse])
async def seed_california_tax_deadlines(
    year: int | None = None,
    user: dict = Depends(get_current_user),
):
    """
    Seed standard California + federal tax deadlines for the current/specified year.
    Idempotent — won't duplicate if already seeded for that year.
    """
    supabase = get_supabase()
    profile = _get_profile(supabase, user["user_id"])
    target_year = year or date.today().year

    # Standard deadlines — adapted to business structure
    entity = profile.get("entity_type", "sole_proprietor") if profile else "sole_proprietor"

    deadlines = [
        {
            "title": "Q1 Federal Estimated Tax Payment (IRS Form 1040-ES)",
            "description": "First quarterly estimated tax payment. Covers Jan 1 – Mar 31 income. Source: IRS Publication 505. https://www.irs.gov/pub/irs-pdf/p505.pdf",
            "event_type": "tax_deadline",
            "due_date": f"{target_year}-04-15",
            "is_recurring": True,
        },
        {
            "title": "Q2 Federal Estimated Tax Payment (IRS Form 1040-ES)",
            "description": "Second quarterly estimated tax payment. Covers Apr 1 – May 31 income. Source: IRS.gov https://www.irs.gov/businesses/small-businesses-self-employed/estimated-taxes",
            "event_type": "tax_deadline",
            "due_date": f"{target_year}-06-17",
            "is_recurring": True,
        },
        {
            "title": "Q3 Federal Estimated Tax Payment (IRS Form 1040-ES)",
            "description": "Third quarterly estimated tax payment. Covers Jun 1 – Aug 31 income. Source: IRS.gov",
            "event_type": "tax_deadline",
            "due_date": f"{target_year}-09-16",
            "is_recurring": True,
        },
        {
            "title": "Q4 Federal Estimated Tax Payment (IRS Form 1040-ES)",
            "description": "Fourth quarterly estimated tax payment. Covers Sep 1 – Dec 31 income. Source: IRS.gov",
            "event_type": "tax_deadline",
            "due_date": f"{target_year + 1}-01-15",
            "is_recurring": True,
        },
        {
            "title": "Federal Tax Return Deadline (Form 1040 / Schedule C)",
            "description": "Annual federal income tax return due. Self-employed: include Schedule C. Source: IRS.gov https://www.irs.gov/filing/individuals/when-to-file",
            "event_type": "tax_deadline",
            "due_date": f"{target_year + 1}-04-15",
            "is_recurring": True,
        },
        {
            "title": "California FTB State Tax Return Deadline",
            "description": "California state income tax return due (Form 540 or 540NR). Source: FTB https://www.ftb.ca.gov/file/when-to-file/index.html",
            "event_type": "tax_deadline",
            "due_date": f"{target_year + 1}-04-15",
            "is_recurring": True,
        },
    ]

    # LLC-specific
    if entity == "llc":
        deadlines.append({
            "title": "California LLC Annual Fee (Form 3522)",
            "description": "California LLCs pay an annual $800 minimum franchise tax. Form 3522. Source: FTB https://www.ftb.ca.gov/forms/2024/2024-3522.html",
            "event_type": "llc_annual_report",
            "due_date": f"{target_year}-04-15",
            "is_recurring": True,
        })

    # California sales tax (quarterly — common for retail/food)
    if profile and profile.get("industry") in ("food_truck", "retail", "alterations"):
        deadlines.extend([
            {
                "title": "CA Sales Tax Return — Q1 (CDTFA)",
                "description": "California sales and use tax filing for Q1. Source: CDTFA https://www.cdtfa.ca.gov/taxes-and-fees/sales-use-tax.htm",
                "event_type": "sales_tax_filing",
                "due_date": f"{target_year}-04-30",
                "is_recurring": True,
            },
            {
                "title": "CA Sales Tax Return — Q2 (CDTFA)",
                "description": "California sales and use tax filing for Q2. Source: CDTFA https://www.cdtfa.ca.gov",
                "event_type": "sales_tax_filing",
                "due_date": f"{target_year}-07-31",
                "is_recurring": True,
            },
            {
                "title": "CA Sales Tax Return — Q3 (CDTFA)",
                "description": "California sales and use tax filing for Q3. Source: CDTFA https://www.cdtfa.ca.gov",
                "event_type": "sales_tax_filing",
                "due_date": f"{target_year}-10-31",
                "is_recurring": True,
            },
            {
                "title": "CA Sales Tax Return — Q4 (CDTFA)",
                "description": "California sales and use tax filing for Q4. Source: CDTFA https://www.cdtfa.ca.gov",
                "event_type": "sales_tax_filing",
                "due_date": f"{target_year + 1}-01-31",
                "is_recurring": True,
            },
        ])

    # Insert, skip duplicates by checking existing titles for this user/year
    existing_result = supabase.table("compliance_events").select("title").eq(
        "user_id", user["user_id"]
    ).gte("due_date", f"{target_year}-01-01").lte(
        "due_date", f"{target_year + 1}-12-31"
    ).execute()

    existing_titles = {r["title"] for r in (existing_result.data or [])}

    new_events = []
    for d in deadlines:
        if d["title"] not in existing_titles:
            result = supabase.table("compliance_events").insert({
                "user_id": user["user_id"],
                **d,
            }).execute()
            if result.data:
                new_events.append(result.data[0])

    return new_events
