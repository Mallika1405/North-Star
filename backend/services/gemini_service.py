"""
Gemini service.
- gemini-1.5-flash: fast ops (chat, grant search interpretation, operations)
- gemini-1.5-pro: heavy reasoning (contract analysis, complex tax questions)
"""

import google.generativeai as genai
from config import settings
from typing import AsyncGenerator
import logging
import json
import re

logger = logging.getLogger(__name__)

genai.configure(api_key=settings.gemini_api_key)

# Model routing
FLASH_MODEL = "gemini-2.5-flash"
PRO_MODEL = "gemini-2.5-pro"

# Domains that get the Pro model (more complex reasoning needed)
PRO_DOMAINS = {"contract"}


def _get_model(domain: str, force_pro: bool = False) -> genai.GenerativeModel:
    model_name = PRO_MODEL if (domain in PRO_DOMAINS or force_pro) else FLASH_MODEL
    return genai.GenerativeModel(model_name)


def _build_gemini_history(messages: list[dict]) -> list[dict]:
    """
    Convert our DB message format to Gemini's content format.
    Gemini uses 'user' and 'model' roles (not 'assistant').
    """
    history = []
    for msg in messages:
        role = "model" if msg["role"] == "assistant" else "user"
        history.append({"role": role, "parts": [msg["content"]]})
    return history


async def chat_with_advisor(
    system_prompt: str,
    user_message: str,
    conversation_history: list[dict],
    domain: str,
    document_text: str | None = None,
) -> dict:
    """
    Single-turn chat call with full conversation history.
    Returns {content, sources_cited}.
    
    document_text: if provided, prepended to user message for contract analysis.
    """
    model = _get_model(domain)

    # Build history (exclude the current message — it's passed separately)
    history = _build_gemini_history(conversation_history)

    # For document analysis, prepend the extracted text
    full_user_message = user_message
    if document_text:
        full_user_message = (
            f"[DOCUMENT TEXT — analyze this]\n\n{document_text}\n\n"
            f"[USER QUESTION]\n{user_message}"
        )

    try:
        chat = model.start_chat(history=history)

        # Inject system prompt as a leading model message if history is empty
        # Gemini doesn't have a native system prompt param in all SDK versions —
        # we use the system_instruction parameter when starting the model.
        model_with_system = genai.GenerativeModel(
            model_name=PRO_MODEL if domain in PRO_DOMAINS else FLASH_MODEL,
            system_instruction=system_prompt,
        )
        chat = model_with_system.start_chat(history=history)
        response = await chat.send_message_async(full_user_message)

        content = response.text
        sources = _extract_sources_from_response(content)

        return {
            "content": content,
            "sources_cited": sources,
        }

    except Exception as e:
        logger.error(f"Gemini chat error (domain={domain}): {e}")
        raise


async def run_grant_search_analysis(
    search_results_raw: str,
    profile: dict,
    language: str = "en",
) -> dict:
    """
    Send raw Tavily search results + profile to Gemini for structured grant analysis.
    Returns parsed grant results list.
    """
    lang_instruction = (
        "Respond in Spanish (Latin American register). "
        "Include English terms in parentheses for all legal/financial terminology. "
        if language == "es"
        else ""
    )

    prompt = f"""
{lang_instruction}
You are analyzing live grant search results for a small business owner.
Extract and structure ONLY real, currently-available grants from the search results below.
Do not invent grants. If a grant appears expired or unavailable, exclude it.

BUSINESS PROFILE:
{json.dumps(profile, indent=2)}

RAW SEARCH RESULTS:
{search_results_raw}

Respond with ONLY a JSON array. No markdown, no explanation, just the JSON.
Each item must have these exact fields:
{{
  "grant_name": "string",
  "provider": "string",
  "url": "string (direct source URL, required)",
  "award_amount_text": "string or null",
  "deadline_text": "string or null",
  "eligibility_summary": "string (2-3 sentences)",
  "why_you_qualify": "string (personalized to the profile above, 1-2 sentences)",
  "confidence": "high" | "medium" | "low"
}}

Confidence guide:
- high: user clearly meets stated eligibility criteria
- medium: user likely qualifies but some criteria are uncertain
- low: partial match, worth researching but not a strong fit

If fewer than 3 grants are clearly real and current, return fewer. Quality over quantity.
"""

    try:
        model = genai.GenerativeModel(
            FLASH_MODEL,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                temperature=0.1,
            ),
        )
        response = await model.generate_content_async(prompt)
        results = json.loads(response.text)
        return {"results": results if isinstance(results, list) else []}
    except Exception as e:
        logger.error(f"Grant search analysis error: {e}")
        return {"results": [], "error": str(e)}


async def run_contract_analysis(
    document_text: str,
    contract_type_hint: str | None,
    profile: dict | None,
    language: str = "en",
) -> dict:
    """
    Deep contract analysis using Gemini Pro.
    Returns structured analysis matching DocumentAnalysisResponse schema.
    """
    lang_instruction = (
        "Respond in Spanish (Latin American register). "
        "Include English terms in parentheses for all legal/financial terminology. "
        if language == "es"
        else ""
    )

    profile_ctx = json.dumps(profile, indent=2) if profile else "No profile available."

    prompt = f"""
{lang_instruction}
You are analyzing a business contract for a small business owner who cannot afford a lawyer.
Your job: explain what the contract says in plain language, flag unusual clauses by 
comparing to standard practice, and surface questions the owner should ask before signing.

BUSINESS PROFILE:
{profile_ctx}

CONTRACT TYPE HINT: {contract_type_hint or "Unknown — determine from document"}

CONTRACT TEXT:
{document_text[:15000]}  

Respond with ONLY valid JSON matching this structure exactly:
{{
  "contract_type": "string",
  "plain_language_summary": "string (3-4 sentences summarizing what this contract is and what the owner is agreeing to)",
  "key_clauses": [
    {{
      "clause_name": "string",
      "explanation": "string (plain language explanation)",
      "is_flagged": boolean,
      "flag_reason": "string or null"
    }}
  ],
  "unusual_clauses": [
    {{
      "clause": "string (brief description)",
      "standard_comparison": "string (what standard contracts typically say)",
      "standard_source": "string (source for the standard)",
      "what_to_ask": "string (specific question to raise with counterparty)"
    }}
  ],
  "questions_to_ask": ["string", ...],
  "free_resources": [
    {{
      "title": "string",
      "url": "string",
      "publication": "string"
    }}
  ]
}}
"""

    try:
        model = genai.GenerativeModel(
            PRO_MODEL,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                temperature=0.1,
            ),
        )
        response = await model.generate_content_async(prompt)
        result = json.loads(response.text)
        result["language"] = language
        return result
    except Exception as e:
        logger.error(f"Contract analysis error: {e}")
        raise


async def decompose_grant_into_tasks(
    grant_name: str,
    grant_provider: str,
    submission_deadline: str | None,
    existing_grants_in_progress: list[dict],
    profile: dict | None,
    language: str = "en",
) -> list[dict]:
    """
    Break a grant application into tasks with deadlines.
    Identify overlapping document tasks if user is pursuing multiple grants.
    Returns list of task dicts.
    """
    lang_instruction = (
        "Respond in Spanish (Latin American register). " if language == "es" else ""
    )

    prompt = f"""
{lang_instruction}
Break this grant application into concrete tasks with deadlines.

GRANT: {grant_name} from {grant_provider}
SUBMISSION DEADLINE: {submission_deadline or "Unknown — use today + 60 days as estimate"}

BUSINESS PROFILE:
{json.dumps(profile or {}, indent=2)}

OTHER GRANTS THIS USER IS CURRENTLY PURSUING:
{json.dumps(existing_grants_in_progress, indent=2)}

Rules:
1. Work backwards from submission deadline. Hard deadline = 3 days before actual deadline.
2. Soft deadlines should be spaced to give realistic prep time.
3. If any document tasks (e.g., "gather business license", "gather 2 years tax returns") 
   are also required by the other grants listed, mark them as shared by listing the 
   grant names in "also_serves_grants".
4. Task types: gather_document, draft_narrative, draft_financial, obtain_signature, review, submit

Respond with ONLY a JSON array:
[
  {{
    "title": "string",
    "description": "string (what exactly to do and why)",
    "task_type": "gather_document" | "draft_narrative" | "draft_financial" | "obtain_signature" | "review" | "submit",
    "soft_deadline": "YYYY-MM-DD or null",
    "hard_deadline": "YYYY-MM-DD or null",
    "is_hard_deadline": boolean,
    "also_serves_grants": ["grant name 1", ...] or []
  }}
]
"""

    try:
        model = genai.GenerativeModel(
            FLASH_MODEL,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                temperature=0.1,
            ),
        )
        response = await model.generate_content_async(prompt)
        tasks = json.loads(response.text)
        return tasks if isinstance(tasks, list) else []
    except Exception as e:
        logger.error(f"Grant task decomposition error: {e}")
        return []


def _extract_sources_from_response(content: str) -> list[dict]:
    """
    Extract structured source citations from model response text.
    Looks for [Source: ...] or URL patterns the model includes.
    Returns list of {title, url, publication} dicts.
    """
    sources = []

    # Pattern: URLs with surrounding context
    url_pattern = re.compile(
        r'(?:https?://[^\s\)\]\>]+)',
        re.IGNORECASE
    )

    urls_found = url_pattern.findall(content)
    seen = set()

    known_publications = {
        "irs.gov": "IRS",
        "sba.gov": "U.S. Small Business Administration",
        "grants.gov": "Grants.gov",
        "ftb.ca.gov": "California Franchise Tax Board",
        "cdtfa.ca.gov": "California CDTFA",
        "edd.ca.gov": "California EDD",
        "dir.ca.gov": "California Labor Commissioner",
        "selfhelp.courts.ca.gov": "California Courts Self-Help Center",
        "legalaidsd.org": "Legal Aid Society of San Diego",
        "score.org": "SCORE",
        "calosba.ca.gov": "California Office of the Small Business Advocate",
        "sbdc.net": "SBDC",
    }

    for url in urls_found:
        url = url.rstrip(".,;)")
        if url in seen:
            continue
        seen.add(url)

        publication = "External Source"
        for domain, name in known_publications.items():
            if domain in url:
                publication = name
                break

        sources.append({
            "title": publication,
            "url": url,
            "publication": publication,
        })

    return sources[:10]  # cap at 10 citations per response
