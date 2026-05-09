from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Literal
from datetime import date, datetime
from uuid import UUID


# ============================================================
# AUTH
# ============================================================

class UserSignup(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    preferred_language: Literal["en", "es"] = "en"

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str


# ============================================================
# BUSINESS PROFILE
# ============================================================

BusinessStage = Literal["idea", "mvp", "early", "established"]
RevenueRange = Literal["pre_revenue", "under_50k", "50k_250k", "250k_1m", "over_1m"]
EmployeeRange = Literal["solo", "1_5", "6_20", "21_50", "over_50"]
EntityType = Literal[
    "sole_proprietor", "llc", "corporation", "s_corp",
    "partnership", "nonprofit", "not_yet_formed"
]

class BusinessProfileCreate(BaseModel):
    business_name: Optional[str] = None
    business_stage: BusinessStage
    city: Optional[str] = None
    county: Optional[str] = None
    state: str = "CA"
    zip_code: Optional[str] = None
    industry: Optional[str] = None
    industry_naics_code: Optional[str] = None
    years_operating: Optional[int] = None
    annual_revenue_range: Optional[RevenueRange] = None
    employee_count_range: Optional[EmployeeRange] = None
    entity_type: Optional[EntityType] = None
    is_minority_owned: bool = False
    is_woman_owned: bool = False
    is_veteran_owned: bool = False
    is_immigrant_owned: bool = False
    is_low_income_area: bool = False
    business_description: Optional[str] = None
    products_services: Optional[str] = None
    target_customers: Optional[str] = None
    has_prototype: bool = False
    is_tech_startup: bool = False
    research_focus: Optional[str] = None

class BusinessProfileUpdate(BusinessProfileCreate):
    business_stage: Optional[BusinessStage] = None  # allow partial updates

class BusinessProfileResponse(BusinessProfileCreate):
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============================================================
# GRANT APPLICATIONS
# ============================================================

GrantStatus = Literal[
    "researching", "in_progress", "submitted",
    "awarded", "declined", "abandoned"
]

class GrantApplicationCreate(BaseModel):
    grant_name: str
    grant_provider: Optional[str] = None
    grant_url: Optional[str] = None
    award_amount_text: Optional[str] = None
    submission_deadline: Optional[date] = None
    eligibility_summary: Optional[str] = None
    user_notes: Optional[str] = None

class GrantApplicationUpdate(BaseModel):
    status: Optional[GrantStatus] = None
    drafted_narrative: Optional[str] = None
    drafted_financials_summary: Optional[str] = None
    drafted_eligibility_justification: Optional[str] = None
    user_notes: Optional[str] = None

class GrantApplicationResponse(GrantApplicationCreate):
    id: UUID
    user_id: UUID
    status: GrantStatus
    drafted_narrative: Optional[str] = None
    drafted_financials_summary: Optional[str] = None
    drafted_eligibility_justification: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============================================================
# GRANT TASKS
# ============================================================

TaskType = Literal[
    "gather_document", "draft_narrative", "draft_financial",
    "obtain_signature", "review", "submit"
]

class GrantTaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    task_type: Optional[TaskType] = None
    soft_deadline: Optional[date] = None
    hard_deadline: Optional[date] = None
    is_hard_deadline: bool = False
    also_serves_grant_ids: List[UUID] = []

class GrantTaskUpdate(BaseModel):
    is_completed: Optional[bool] = None
    soft_deadline: Optional[date] = None
    title: Optional[str] = None
    description: Optional[str] = None
    google_calendar_event_id: Optional[str] = None

class GrantTaskResponse(GrantTaskCreate):
    id: UUID
    grant_application_id: UUID
    user_id: UUID
    google_calendar_event_id: Optional[str] = None
    calendar_added_at: Optional[datetime] = None
    is_completed: bool
    completed_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ============================================================
# CONVERSATIONS & MESSAGES
# ============================================================

AdvisorDomain = Literal["grant", "tax", "contract", "operations"]
Language = Literal["en", "es"]

class ConversationCreate(BaseModel):
    domain: AdvisorDomain
    language: Language = "en"
    title: Optional[str] = None

class ConversationResponse(ConversationCreate):
    id: UUID
    user_id: UUID
    is_archived: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class MessageCreate(BaseModel):
    content: str
    language: Language = "en"
    # Optional: for document reading, pass extracted text separately
    document_text: Optional[str] = None
    document_filename: Optional[str] = None

class SourceCitation(BaseModel):
    title: str
    url: Optional[str] = None
    publication: Optional[str] = None

class MessageResponse(BaseModel):
    id: UUID
    conversation_id: UUID
    role: Literal["user", "assistant"]
    content: str
    sources_cited: List[SourceCitation] = []
    document_filename: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class ChatResponse(BaseModel):
    message: MessageResponse
    conversation_id: UUID


# ============================================================
# GRANT SEARCH
# ============================================================

class GrantSearchRequest(BaseModel):
    language: Language = "en"
    # Override profile for targeted searches
    override_industry: Optional[str] = None
    override_stage: Optional[str] = None
    additional_keywords: Optional[str] = None

class GrantSearchResult(BaseModel):
    grant_name: str
    provider: str
    url: str
    award_amount_text: Optional[str] = None
    deadline_text: Optional[str] = None
    eligibility_summary: str
    why_you_qualify: str   # personalized to their profile
    confidence: Literal["high", "medium", "low"]

class GrantSearchResponse(BaseModel):
    results: List[GrantSearchResult]
    search_note: str          # e.g. "Searched live as of [date]"
    sources_searched: List[str]


# ============================================================
# CALENDAR
# ============================================================

class CalendarEventPreview(BaseModel):
    title: str
    description: str
    start_date: date
    end_date: Optional[date] = None
    is_hard_deadline: bool = False     # red vs yellow
    related_grant_names: List[str] = []
    source_url: Optional[str] = None
    # Internal — used after user confirms
    task_id: Optional[UUID] = None
    compliance_event_id: Optional[UUID] = None

class CalendarConfirmRequest(BaseModel):
    events_to_add: List[CalendarEventPreview]  # user has reviewed and confirmed

class CalendarAddResponse(BaseModel):
    added: List[str]    # google calendar event IDs
    failed: List[str]   # titles of events that failed


# ============================================================
# COMPLIANCE EVENTS
# ============================================================

EventType = Literal[
    "tax_deadline", "license_renewal", "llc_annual_report",
    "sales_tax_filing", "payroll_filing", "other"
]

class ComplianceEventCreate(BaseModel):
    title: str
    description: Optional[str] = None
    event_type: EventType
    due_date: date
    is_recurring: bool = False
    recurrence_rule: Optional[str] = None

class ComplianceEventResponse(ComplianceEventCreate):
    id: UUID
    user_id: UUID
    google_calendar_event_id: Optional[str] = None
    calendar_added_at: Optional[datetime] = None
    is_dismissed: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ============================================================
# DOCUMENT UPLOAD (contract reading)
# ============================================================

class DocumentAnalysisResponse(BaseModel):
    contract_type: str                    # e.g. "Commercial Lease", "Supplier Agreement"
    plain_language_summary: str
    key_clauses: List[dict]               # [{clause_name, explanation, is_flagged, flag_reason}]
    unusual_clauses: List[dict]           # [{clause, standard_comparison, what_to_ask}]
    questions_to_ask: List[str]
    free_resources: List[SourceCitation]
    language: Language


# ============================================================
# GOOGLE AUTH
# ============================================================

class GoogleAuthURL(BaseModel):
    auth_url: str

class GoogleAuthCallback(BaseModel):
    code: str
    state: Optional[str] = None
