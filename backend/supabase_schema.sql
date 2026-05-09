-- ============================================================
-- SUPABASE SCHEMA
-- Run this in your Supabase SQL editor to set up all tables.
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS
-- Minimal auth layer; Supabase Auth handles passwords.
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    preferred_language TEXT DEFAULT 'en' CHECK (preferred_language IN ('en', 'es')),
    google_calendar_token JSONB  -- Encrypted OAuth token stored as JSON
);

-- ============================================================
-- BUSINESS PROFILES
-- One per user. Everything downstream adapts to this.
-- ============================================================
CREATE TABLE IF NOT EXISTS business_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Identity
    business_name TEXT,
    business_stage TEXT NOT NULL CHECK (business_stage IN (
        'idea',           -- concept exists, nothing built
        'mvp',            -- product built, no revenue
        'early',          -- under 2 years, under $50k revenue
        'established'     -- 2+ years, $50k+ revenue
    )),

    -- Location
    city TEXT,
    county TEXT,
    state TEXT DEFAULT 'CA',
    zip_code TEXT,

    -- Business details
    industry TEXT,                    -- e.g. "food_truck", "retail", "cleaning", "alterations"
    industry_naics_code TEXT,         -- for grant eligibility matching
    years_operating INTEGER,
    annual_revenue_range TEXT CHECK (annual_revenue_range IN (
        'pre_revenue', 'under_50k', '50k_250k', '250k_1m', 'over_1m'
    )),
    employee_count_range TEXT CHECK (employee_count_range IN (
        'solo', '1_5', '6_20', '21_50', 'over_50'
    )),
    entity_type TEXT CHECK (entity_type IN (
        'sole_proprietor', 'llc', 'corporation', 's_corp', 'partnership', 'nonprofit', 'not_yet_formed'
    )),

    -- Demographics (for grant eligibility)
    is_minority_owned BOOLEAN DEFAULT FALSE,
    is_woman_owned BOOLEAN DEFAULT FALSE,
    is_veteran_owned BOOLEAN DEFAULT FALSE,
    is_immigrant_owned BOOLEAN DEFAULT FALSE,
    is_low_income_area BOOLEAN DEFAULT FALSE,

    -- Free text for grant narratives
    business_description TEXT,        -- 2-3 sentence summary used in grant drafts
    products_services TEXT,           -- what they sell
    target_customers TEXT,

    -- Startup-specific (for mvp/idea stage)
    has_prototype BOOLEAN DEFAULT FALSE,
    is_tech_startup BOOLEAN DEFAULT FALSE,
    research_focus TEXT               -- for SBIR/STTR applicability

    UNIQUE(user_id)  -- one profile per user
);

-- ============================================================
-- GRANT APPLICATIONS
-- Tracks grants the user is actively pursuing.
-- ============================================================
CREATE TABLE IF NOT EXISTS grant_applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Grant info (from live search, stored at time of selection)
    grant_name TEXT NOT NULL,
    grant_provider TEXT,              -- e.g. "SBA", "California Office of the Small Business Advocate"
    grant_url TEXT,                   -- primary source link
    award_amount_text TEXT,           -- e.g. "$5,000 - $25,000"
    submission_deadline DATE,
    eligibility_summary TEXT,

    -- Application state
    status TEXT DEFAULT 'researching' CHECK (status IN (
        'researching',   -- user is evaluating
        'in_progress',   -- actively working on application
        'submitted',     -- submitted, awaiting decision
        'awarded',       -- won
        'declined',      -- not awarded
        'abandoned'      -- user stopped pursuing
    )),

    -- Drafted content (updated iteratively)
    drafted_narrative TEXT,
    drafted_financials_summary TEXT,
    drafted_eligibility_justification TEXT,

    -- Notes
    user_notes TEXT
);

-- ============================================================
-- GRANT TASKS
-- Decomposed tasks for each grant application.
-- ============================================================
CREATE TABLE IF NOT EXISTS grant_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    grant_application_id UUID NOT NULL REFERENCES grant_applications(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Task details
    title TEXT NOT NULL,
    description TEXT,
    task_type TEXT CHECK (task_type IN (
        'gather_document',   -- collect a required document
        'draft_narrative',   -- write application narrative
        'draft_financial',   -- prepare financial summary
        'obtain_signature',  -- get letter of support, notarization, etc.
        'review',            -- internal review before submit
        'submit'             -- actual submission
    )),

    -- Scheduling
    soft_deadline DATE,
    hard_deadline DATE,
    is_hard_deadline BOOLEAN DEFAULT FALSE,

    -- Shared tasks (same doc needed for multiple grants)
    -- Array of grant_application_ids this task also serves
    also_serves_grant_ids UUID[] DEFAULT '{}',

    -- Calendar integration
    google_calendar_event_id TEXT,   -- populated after calendar add
    calendar_added_at TIMESTAMPTZ,

    -- Completion
    is_completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMPTZ
);

-- ============================================================
-- CONVERSATIONS
-- Persistent chat history per advisor domain.
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Which advisor mode
    domain TEXT NOT NULL CHECK (domain IN (
        'grant',       -- Grant & Funding Discovery
        'tax',         -- Tax & Compliance Guidance
        'contract',    -- Contract & Document Reading
        'operations'   -- Operational Problem Solving
    )),

    -- Metadata
    title TEXT,          -- auto-generated summary of conversation topic
    language TEXT DEFAULT 'en' CHECK (language IN ('en', 'es')),
    is_archived BOOLEAN DEFAULT FALSE
);

-- ============================================================
-- MESSAGES
-- Individual messages within a conversation.
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,

    -- For assistant messages: track sources cited
    sources_cited JSONB DEFAULT '[]',  -- [{title, url, publication}]

    -- For messages with uploaded documents
    document_filename TEXT,
    document_summary TEXT    -- extracted summary, not full text
);

-- ============================================================
-- COMPLIANCE CALENDAR EVENTS
-- Tax deadlines, license renewals, filing dates.
-- Not grant tasks — those live in grant_tasks.
-- ============================================================
CREATE TABLE IF NOT EXISTS compliance_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    title TEXT NOT NULL,
    description TEXT,
    event_type TEXT CHECK (event_type IN (
        'tax_deadline',
        'license_renewal',
        'llc_annual_report',
        'sales_tax_filing',
        'payroll_filing',
        'other'
    )),
    due_date DATE NOT NULL,
    is_recurring BOOLEAN DEFAULT FALSE,
    recurrence_rule TEXT,              -- iCal RRULE string if recurring

    -- Calendar sync
    google_calendar_event_id TEXT,
    calendar_added_at TIMESTAMPTZ,

    -- State
    is_dismissed BOOLEAN DEFAULT FALSE
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_business_profiles_user_id ON business_profiles(user_id);
CREATE INDEX idx_grant_applications_user_id ON grant_applications(user_id);
CREATE INDEX idx_grant_applications_status ON grant_applications(status);
CREATE INDEX idx_grant_tasks_grant_application_id ON grant_tasks(grant_application_id);
CREATE INDEX idx_grant_tasks_user_id ON grant_tasks(user_id);
CREATE INDEX idx_grant_tasks_soft_deadline ON grant_tasks(soft_deadline);
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_domain ON conversations(domain);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_compliance_events_user_id ON compliance_events(user_id);
CREATE INDEX idx_compliance_events_due_date ON compliance_events(due_date);

-- ============================================================
-- ROW LEVEL SECURITY
-- Users can only access their own data.
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE grant_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE grant_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_events ENABLE ROW LEVEL SECURITY;

-- Users table: users can read/update their own row
CREATE POLICY "users_own_row" ON users
    FOR ALL USING (auth.uid() = id);

-- Business profiles
CREATE POLICY "business_profiles_own" ON business_profiles
    FOR ALL USING (auth.uid() = user_id);

-- Grant applications
CREATE POLICY "grant_applications_own" ON grant_applications
    FOR ALL USING (auth.uid() = user_id);

-- Grant tasks
CREATE POLICY "grant_tasks_own" ON grant_tasks
    FOR ALL USING (auth.uid() = user_id);

-- Conversations
CREATE POLICY "conversations_own" ON conversations
    FOR ALL USING (auth.uid() = user_id);

-- Messages
CREATE POLICY "messages_own" ON messages
    FOR ALL USING (auth.uid() = user_id);

-- Compliance events
CREATE POLICY "compliance_events_own" ON compliance_events
    FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- UPDATED_AT TRIGGER
-- Auto-updates updated_at on any row change.
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_business_profiles_updated_at
    BEFORE UPDATE ON business_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_grant_applications_updated_at
    BEFORE UPDATE ON grant_applications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_grant_tasks_updated_at
    BEFORE UPDATE ON grant_tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();