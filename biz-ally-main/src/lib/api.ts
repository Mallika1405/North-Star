// src/lib/api.ts
// Typed API client for the Negocio backend.
// All requests go through apiFetch which injects the auth token automatically.

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// ============================================================
// CORE FETCH WRAPPER
// ============================================================

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  skipAuth = false,
): Promise<T> {
  const token = localStorage.getItem("negocio_token");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token && !skipAuth) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers, credentials: "omit" });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {}
    throw new ApiError(res.status, detail);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json();
}

// ============================================================
// TYPES (mirrors backend schemas)
// ============================================================

export type Language = "en" | "es";
export type BusinessStage = "idea" | "mvp" | "early" | "established";
export type AdvisorDomain = "grant" | "tax" | "contract" | "operations";
export type GrantStatus = "researching" | "in_progress" | "submitted" | "awarded" | "declined" | "abandoned";

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user_id: string;
}

export interface BusinessProfile {
  id: string;
  user_id: string;
  business_name?: string;
  business_stage: BusinessStage;
  city?: string;
  state?: string;
  zip_code?: string;
  industry?: string;
  years_operating?: number;
  annual_revenue_range?: string;
  employee_count_range?: string;
  entity_type?: string;
  is_minority_owned: boolean;
  is_woman_owned: boolean;
  is_veteran_owned: boolean;
  is_immigrant_owned: boolean;
  is_low_income_area: boolean;
  business_description?: string;
  products_services?: string;
  target_customers?: string;
  has_prototype: boolean;
  is_tech_startup: boolean;
  research_focus?: string;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  domain: AdvisorDomain;
  language: Language;
  title?: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface SourceCitation {
  title: string;
  url?: string;
  publication?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  sources_cited: SourceCitation[];
  document_filename?: string;
  created_at: string;
}

export interface GrantSearchResult {
  grant_name: string;
  provider: string;
  url: string;
  award_amount_text?: string;
  deadline_text?: string;
  eligibility_summary: string;
  why_you_qualify: string;
  confidence: "high" | "medium" | "low";
}

export interface GrantSearchResponse {
  results: GrantSearchResult[];
  search_note: string;
  sources_searched: string[];
}

export interface GrantApplication {
  id: string;
  user_id: string;
  grant_name: string;
  grant_provider?: string;
  grant_url?: string;
  award_amount_text?: string;
  submission_deadline?: string;
  eligibility_summary?: string;
  status: GrantStatus;
  drafted_narrative?: string;
  user_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface GrantTask {
  id: string;
  grant_application_id: string;
  user_id: string;
  title: string;
  description?: string;
  task_type?: string;
  soft_deadline?: string;
  hard_deadline?: string;
  is_hard_deadline: boolean;
  also_serves_grant_ids: string[];
  google_calendar_event_id?: string;
  is_completed: boolean;
  completed_at?: string;
  created_at: string;
}

export interface CalendarEventPreview {
  title: string;
  description: string;
  start_date: string;
  is_hard_deadline: boolean;
  related_grant_names: string[];
  source_url?: string;
  task_id?: string;
  compliance_event_id?: string;
}

export interface ComplianceEvent {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  event_type: string;
  due_date: string;
  is_recurring: boolean;
  google_calendar_event_id?: string;
  is_dismissed: boolean;
  created_at: string;
}

export interface UpcomingEvent {
  type: "grant_task" | "compliance";
  title: string;
  date: string;
  is_hard_deadline?: boolean;
  event_type?: string;
  task_id?: string;
  grant_application_id?: string;
  compliance_event_id?: string;
}

// ============================================================
// AUTH
// ============================================================

export const auth = {
  signup: (email: string, password: string, preferred_language: Language = "en") =>
    apiFetch<TokenResponse>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, preferred_language }),
    }, true),

  login: (email: string, password: string) =>
    apiFetch<TokenResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }, true),

  me: () => apiFetch<{ id: string; email: string; preferred_language: Language }>("/auth/me"),
};

// ============================================================
// PROFILE
// ============================================================

export const profile = {
  get: () => apiFetch<BusinessProfile | null>("/profile"),

  create: (data: Partial<BusinessProfile> & { business_stage: BusinessStage }) =>
    apiFetch<BusinessProfile>("/profile", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (data: Partial<BusinessProfile>) =>
    apiFetch<BusinessProfile>("/profile", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
};

// ============================================================
// CHAT
// ============================================================

export const chat = {
  listConversations: (domain?: AdvisorDomain) =>
    apiFetch<Conversation[]>(`/chat/conversations${domain ? `?domain=${domain}` : ""}`),

  createConversation: (domain: AdvisorDomain, language: Language = "en") =>
    apiFetch<Conversation>("/chat/conversations", {
      method: "POST",
      body: JSON.stringify({ domain, language }),
    }),

  getMessages: (conversationId: string) =>
    apiFetch<Message[]>(`/chat/conversations/${conversationId}/messages`),

  sendMessage: (conversationId: string, content: string, language: Language = "en") =>
    apiFetch<{ message: Message; conversation_id: string }>(
      `/chat/conversations/${conversationId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ content, language }),
      },
    ),

  uploadDocument: async (conversationId: string, file: File, question: string, language: Language = "en") => {
    const token = localStorage.getItem("negocio_token");
    const form = new FormData();
    form.append("file", file);
    form.append("question", question);
    form.append("language", language);

    const res = await fetch(`${BASE_URL}/chat/conversations/${conversationId}/upload-document`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(res.status, body.detail ?? "Upload failed");
    }
    return res.json() as Promise<{ message: Message; conversation_id: string }>;
  },
};

// ============================================================
// GRANTS
// ============================================================

export const grants = {
  search: (language: Language = "en", additionalKeywords?: string) =>
    apiFetch<GrantSearchResponse>("/grants/search", {
      method: "POST",
      body: JSON.stringify({ language, additional_keywords: additionalKeywords }),
    }),

  listApplications: (status?: GrantStatus) =>
    apiFetch<GrantApplication[]>(`/grants/applications${status ? `?status=${status}` : ""}`),

  createApplication: (data: {
    grant_name: string;
    grant_provider?: string;
    grant_url?: string;
    award_amount_text?: string;
    submission_deadline?: string;
    eligibility_summary?: string;
  }) =>
    apiFetch<GrantApplication>("/grants/applications", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateApplication: (id: string, data: { status?: GrantStatus; user_notes?: string }) =>
    apiFetch<GrantApplication>(`/grants/applications/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  decomposeTasks: (applicationId: string) =>
    apiFetch<GrantTask[]>(`/grants/applications/${applicationId}/decompose-tasks`, {
      method: "POST",
    }),

  getCalendarPreview: (applicationId: string) =>
    apiFetch<CalendarEventPreview[]>(`/grants/applications/${applicationId}/calendar-preview`),

  getTasks: (applicationId: string) =>
    apiFetch<GrantTask[]>(`/grants/applications/${applicationId}/tasks`),
};

// ============================================================
// CALENDAR
// ============================================================

export const calendar = {
  status: () => apiFetch<{ connected: boolean }>("/calendar/status"),

  getAuthUrl: () => apiFetch<{ auth_url: string }>("/calendar/auth-url"),

  addEvents: (events: CalendarEventPreview[]) =>
    apiFetch<{ added: string[]; failed: string[] }>("/calendar/add-events", {
      method: "POST",
      body: JSON.stringify({ events_to_add: events }),
    }),

  upcoming: (daysAhead = 60) =>
    apiFetch<{ events: UpcomingEvent[]; period_days: number }>(
      `/calendar/upcoming?days_ahead=${daysAhead}`,
    ),
};

// ============================================================
// COMPLIANCE
// ============================================================

export const compliance = {
  list: () => apiFetch<ComplianceEvent[]>("/compliance"),
  seedTaxDeadlines: () =>
    apiFetch<ComplianceEvent[]>("/compliance/seed-tax-deadlines", { method: "POST" }),
};