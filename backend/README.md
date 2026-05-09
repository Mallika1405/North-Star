# Small Business Advisor — Backend

AI-powered business advisor for underserved small business owners in California.
Grant discovery, tax guidance, contract reading, and operational help — all sourced,
transparent, and bilingual (English + Spanish).

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | FastAPI |
| AI | Gemini 1.5 Flash (chat/grants/ops) + Gemini 1.5 Pro (contracts) |
| Database | Supabase (Postgres + Auth + RLS) |
| Search | Tavily (live grant + compliance search) |
| Document parsing | PyMuPDF |
| Calendar | Google Calendar API (OAuth2) |

---

## Setup

### 1. Clone and install

```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Environment variables

```bash
cp .env.example .env
# Fill in all values in .env
```

Required keys:
- `GEMINI_API_KEY` — Google AI Studio: https://aistudio.google.com/app/apikey
- `SUPABASE_URL` + `SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_KEY` — Supabase project settings
- `TAVILY_API_KEY` — https://tavily.com (free tier available)
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — Google Cloud Console OAuth2 credentials
- `APP_SECRET_KEY` — any random string (used for JWT signing)

### 3. Supabase setup

1. Create a new Supabase project at https://supabase.com
2. Go to SQL Editor and run the entire contents of `supabase_schema.sql`
3. Copy your project URL and keys from Settings → API

### 4. Google Calendar OAuth setup

1. Go to https://console.cloud.google.com
2. Create a project → Enable "Google Calendar API"
3. Create OAuth2 credentials (Web Application type)
4. Add `http://localhost:8000/auth/google/callback` as an authorized redirect URI
5. Copy Client ID and Client Secret to `.env`

### 5. Run

```bash
uvicorn main:app --reload --port 8000
```

API docs available at http://localhost:8000/docs

---

## API Overview

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/signup` | Register new user |
| POST | `/auth/login` | Login, get JWT |
| GET | `/auth/me` | Get current user |

### Business Profile (required before grant search)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/profile` | Get profile |
| POST | `/profile` | Create profile (first-time setup) |
| PUT | `/profile` | Update profile |

### Chat — 4 Advisor Domains
| Method | Endpoint | Description |
|---|---|---|
| POST | `/chat/conversations` | Start conversation (`domain`: grant/tax/contract/operations) |
| GET | `/chat/conversations` | List conversations |
| POST | `/chat/conversations/{id}/messages` | Send message, get AI response |
| POST | `/chat/conversations/{id}/upload-document` | Upload contract for analysis |

### Grant Discovery & Tracking
| Method | Endpoint | Description |
|---|---|---|
| POST | `/grants/search` | **Live** grant search (Tavily + Gemini) |
| POST | `/grants/applications` | Track a grant application |
| POST | `/grants/applications/{id}/decompose-tasks` | Break into tasks with cross-grant batching |
| GET | `/grants/applications/{id}/calendar-preview` | Preview events before calendar add |

### Calendar
| Method | Endpoint | Description |
|---|---|---|
| GET | `/calendar/status` | Is Google Calendar connected? |
| GET | `/calendar/auth-url` | Get OAuth URL to connect Calendar |
| POST | `/calendar/add-events` | Add **confirmed** events to Google Calendar |
| GET | `/calendar/upcoming` | Unified upcoming deadlines view |

### Compliance
| Method | Endpoint | Description |
|---|---|---|
| GET | `/compliance` | List tax/compliance deadlines |
| POST | `/compliance/seed-tax-deadlines` | Auto-populate CA + federal tax deadlines |

---

## Architecture Notes

### AI Model Routing
- **Gemini 1.5 Flash**: Chat (all domains), grant search analysis, task decomposition, operations
- **Gemini 1.5 Pro**: Contract analysis (requires deeper reasoning on long documents)

### System Prompt Architecture
Four distinct system prompts in `prompts/system_prompts.py`:
- Each has explicit scope limits and escalation language (SCORE, Legal Aid, SBDC)
- Business profile context is injected at request time
- Spanish mode prepends a language instruction block
- Source citation requirements are baked into each prompt

### Grant Search Flow
```
POST /grants/search
  → Tavily searches 5 targeted queries against authoritative domains
  → Raw results sent to Gemini Flash for structured analysis
  → Returns personalized results with eligibility reasoning
  → All results link to primary sources
```

### Calendar Flow (requires explicit user confirmation)
```
POST /grants/applications/{id}/decompose-tasks
  → Gemini generates tasks with deadlines (cross-grant batching)
  → Tasks stored in Supabase

GET /grants/applications/{id}/calendar-preview
  → Returns task list as CalendarEventPreview objects
  → Frontend shows red (hard) / yellow (soft) deadline preview

POST /calendar/add-events  (only after user clicks Confirm)
  → Creates Google Calendar events with reminders
  → Stores calendar event IDs back in Supabase
```

### Language Support
- English and Spanish in MVP
- Spanish: Latin American professional register
- English terms in parentheses for all legal/financial terminology on first use
- Language selection is per-conversation, stored in DB

---

## Scope Limits (enforced in system prompts)

The AI explicitly declines:
- Active IRS audits, disputes, prior-year amendments
- Multi-state tax situations
- Legal representation or advice
- Industries with complex specialist regulation (healthcare billing, financial services)
- Anything requiring a licensed CPA/attorney

When scope limits are hit, responses route to: SCORE San Diego, Legal Aid Society of San Diego,
SBDC, IRS VITA, USD/California Western law school clinics.
