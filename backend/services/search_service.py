"""
Gemini-powered funding discovery.
Uses Gemini 2.5 Flash with a rich prompt covering 6 funding categories.
Gemini has knowledge of major programs (YC, Techstars, SBA, CalOSBA, etc.)
and their typical deadline cycles.
"""

import google.generativeai as genai
from config import settings
from datetime import date
import json
import logging

logger = logging.getLogger(__name__)
genai.configure(api_key=settings.gemini_api_key)

FLASH_MODEL = "gemini-1.5-flash"

CATEGORY_META = {
    "grants":            "Direct grants from government agencies and foundations",
    "accelerators":      "Accelerators and incubators (Y Combinator, Techstars, 500 Startups, regional programs)",
    "conferences":       "Conferences, networking events, workshops, and summits",
    "pitch_competitions":"Pitch competitions and startup prizes with cash awards",
    "subsidies":         "Subsidies, tax credits, and government incentive programs",
    "investor_programs": "Angel investor programs, seed funds, and impact investor networks",
}


def _build_prompt(profile: dict, keywords: str | None) -> str:
    today = date.today().isoformat()
    year = date.today().year
    city = profile.get("city", "San Diego")
    industry = profile.get("industry", "small business")
    stage = profile.get("business_stage", "established")
    description = profile.get("business_description", "")
    rev = profile.get("annual_revenue_range", "")

    demos = []
    if profile.get("is_woman_owned"): demos.append("woman-owned")
    if profile.get("is_minority_owned"): demos.append("minority-owned")
    if profile.get("is_veteran_owned"): demos.append("veteran-owned")
    if profile.get("is_immigrant_owned"): demos.append("immigrant-owned")
    if profile.get("is_lgbtq_owned"): demos.append("LGBTQ+-owned")
    demo_str = ", ".join(demos) if demos else "general small business"

    extra = f"\nAdditional keywords: {keywords}" if keywords else ""

    return f"""Today is {today}. You are a funding advisor for small business owners in California.

Find real funding opportunities for this business across ALL 6 categories below.
Focus on deadlines between now and {year+1}. Include well-known programs even if you are 
not 100% certain of the exact deadline — flag uncertainty in deadline_text.

BUSINESS PROFILE:
- Industry: {industry}
- Stage: {stage}
- Location: {city}, California
- Demographics: {demo_str}
- Revenue: {rev or "not specified"}
{f"- Description: {description}" if description else ""}{extra}

Return a JSON object with results for each category. For each opportunity include:
- grant_name: full program name
- provider: organization offering it
- award_amount_text: what they offer (funding amount, equity, resources)
- deadline_text: specific deadline if known (e.g. "August 4, {year}" or "Rolling / quarterly")
- eligibility_summary: who qualifies in 1-2 sentences
- why_you_qualify: why THIS specific business qualifies (1 sentence, be specific)
- url: direct URL to apply or learn more
- confidence: "high" if well-known program, "medium" if likely relevant, "low" if uncertain

Include AT LEAST 3-5 results per category. Include programs like:
- grants: SBA grants, CalOSBA programs, Hello Alice, Amber Grant, IFundWomen
- accelerators: Y Combinator — the Summer 2026 (S26) deadline was May 4 2026 (already passed, late apps still accepted). The Fall 2026 (F26) deadline is projected for approximately August 2026 — list this as the upcoming opportunity. Do NOT say August 4 specifically. Techstars, 500 Startups, local San Diego accelerators
- conferences: NAWBO events, SBDC workshops, San Diego startup events, industry-specific conferences
- pitch_competitions: local San Diego competitions, national ones open to CA businesses
- subsidies: California Competes tax credit, energy subsidies, CDFI programs, EDD programs
- investor_programs: angel networks, SBIC programs, impact investors, {demo_str} focused funds

Respond ONLY with this JSON structure, no markdown, no explanation:
{{
  "grants": [...],
  "accelerators": [...],
  "conferences": [...],
  "pitch_competitions": [...],
  "subsidies": [...],
  "investor_programs": [...]
}}

Each array item: {{"grant_name":"...","provider":"...","award_amount_text":"...","deadline_text":"...","eligibility_summary":"...","why_you_qualify":"...","url":"...","confidence":"high"|"medium"|"low"}}
"""


async def search_funding_by_category(
    profile: dict,
    additional_keywords: str | None = None,
) -> dict:
    """
    Use Gemini to generate funding opportunities across 6 categories.
    Single call returns all categories at once.
    """
    prompt = _build_prompt(profile, additional_keywords)

    try:
        model = genai.GenerativeModel(
            FLASH_MODEL,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                temperature=0.2,
            ),
        )
        response = await model.generate_content_async(prompt)
        text = response.text.strip()

        # Strip markdown if present
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()

        results = json.loads(text)

        # Validate structure
        categories = ["grants", "accelerators", "conferences", "pitch_competitions", "subsidies", "investor_programs"]
        results_by_category = {}
        for cat in categories:
            cat_results = results.get(cat, [])
            if isinstance(cat_results, list):
                results_by_category[cat] = cat_results[:8]
            else:
                results_by_category[cat] = []

        return {
            "results_by_category": results_by_category,
            "sources_searched": ["Gemini 1.5 Flash knowledge base"],
            "search_date": date.today().isoformat(),
            "categories_searched": categories,
        }

    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error in funding search: {e}")
        return _empty_result()
    except Exception as e:
        logger.error(f"Funding search error: {e}")
        return _empty_result()


def _empty_result() -> dict:
    categories = ["grants", "accelerators", "conferences", "pitch_competitions", "subsidies", "investor_programs"]
    return {
        "results_by_category": {cat: [] for cat in categories},
        "sources_searched": [],
        "search_date": date.today().isoformat(),
        "categories_searched": categories,
    }


# Backward-compat alias
async def search_grants_live(
    profile: dict,
    additional_keywords: str | None = None,
    override_industry: str | None = None,
    override_stage: str | None = None,
) -> dict:
    if override_industry:
        profile = {**profile, "industry": override_industry}
    if override_stage:
        profile = {**profile, "business_stage": override_stage}
    data = await search_funding_by_category(profile, additional_keywords)
    all_results = []
    for cat_results in data["results_by_category"].values():
        all_results.extend(cat_results)
    return {
        "raw_results": all_results[:15],
        "sources_searched": data["sources_searched"],
        "queries_run": [],
        "search_date": data["search_date"],
        "total_results_found": len(all_results),
    }


async def search_compliance_info(query: str) -> list[dict]:
    try:
        model = genai.GenerativeModel(FLASH_MODEL)
        response = await model.generate_content_async(
            f"Answer this compliance question with citations to IRS.gov, FTB.ca.gov, or other authoritative sources: {query}"
        )
        return [{"content": response.text, "url": "", "title": query}]
    except Exception as e:
        logger.error(f"Compliance search error: {e}")
        return []