"""
Tavily-powered live grant search.
Searches authoritative sources: SBA, Grants.gov, CalOSBA, California Competes, SBDC.
Never caches results — always live.
"""

from tavily import TavilyClient
from config import settings
from datetime import date
import logging

logger = logging.getLogger(__name__)

_client: TavilyClient | None = None


def get_tavily() -> TavilyClient:
    global _client
    if _client is None:
        _client = TavilyClient(api_key=settings.tavily_api_key)
    return _client


# Authoritative grant sources to search first
AUTHORITATIVE_GRANT_DOMAINS = [
    "sba.gov",
    "grants.gov",
    "calosba.ca.gov",         # California Office of the Small Business Advocate
    "ibank.ca.gov",           # California IBank
    "hcd.ca.gov",             # California Housing and Community Development
    "calbizcentral.com",
    "sbdc.net",
    "score.org",
    "calcompetes.ca.gov",     # California Competes
    "caminofinancial.com",    # often surfaces CA small biz grants
]

# SBIR/STTR sources for startup stage
STARTUP_GRANT_DOMAINS = [
    "sbir.gov",
    "nsf.gov",
    "grants.gov",
    "sba.gov",
]


def _build_grant_queries(profile: dict, additional_keywords: str | None = None) -> list[str]:
    """
    Build targeted search queries based on business profile.
    Returns multiple queries to maximize coverage.
    """
    queries = []
    year = date.today().year
    state = profile.get("state", "CA")
    city = profile.get("city", "San Diego")
    industry = profile.get("industry", "small business")
    stage = profile.get("business_stage", "established")

    # Base query
    base = f"small business grants {city} California {year}"

    # Demographic-specific grants
    if profile.get("is_minority_owned"):
        queries.append(f"minority owned small business grants California {year}")
    if profile.get("is_woman_owned"):
        queries.append(f"women owned small business grants California {year}")
    if profile.get("is_veteran_owned"):
        queries.append(f"veteran small business grants California {year}")
    if profile.get("is_immigrant_owned"):
        queries.append(f"immigrant entrepreneur grants California {year}")

    # Stage-specific
    if stage in ("idea", "mvp"):
        queries.append(f"SBIR STTR grant {industry} startup {year}")
        queries.append(f"early stage startup non-dilutive funding California {year}")
        queries.append(f"pitch competition small business startup California {year}")
    else:
        queries.append(f"{industry} small business grants California {year}")
        queries.append(base)
        queries.append(f"SBA grant {city} California operating business {year}")
        queries.append(f"California Competes grant {year} application")

    # Revenue range targeted
    rev = profile.get("annual_revenue_range", "")
    if rev in ("under_50k", "50k_250k"):
        queries.append(f"microgrant small business California under $50000 {year}")

    # Industry specific
    if industry:
        queries.append(f"{industry} business grant California {year} deadline")

    if additional_keywords:
        queries.append(f"{additional_keywords} grant California {year}")

    return queries[:5]  # Tavily has rate limits — cap at 5 queries


async def search_grants_live(
    profile: dict,
    additional_keywords: str | None = None,
    override_industry: str | None = None,
    override_stage: str | None = None,
) -> dict:
    """
    Execute live grant searches using Tavily.
    Returns raw results + metadata for Gemini to analyze.
    """
    tavily = get_tavily()

    if override_industry:
        profile = {**profile, "industry": override_industry}
    if override_stage:
        profile = {**profile, "business_stage": override_stage}

    queries = _build_grant_queries(profile, additional_keywords)
    stage = profile.get("business_stage", "established")

    all_results = []
    sources_searched = set()

    include_domains = (
        STARTUP_GRANT_DOMAINS
        if stage in ("idea", "mvp")
        else AUTHORITATIVE_GRANT_DOMAINS
    )

    for query in queries:
        try:
            result = tavily.search(
                query=query,
                search_depth="advanced",
                include_domains=include_domains,
                max_results=5,
                include_answer=True,
            )

            for r in result.get("results", []):
                all_results.append({
                    "title": r.get("title", ""),
                    "url": r.get("url", ""),
                    "content": r.get("content", "")[:1500],  # trim for context window
                    "score": r.get("score", 0),
                })
                if r.get("url"):
                    from urllib.parse import urlparse
                    domain = urlparse(r["url"]).netloc
                    sources_searched.add(domain)

        except Exception as e:
            logger.warning(f"Tavily search failed for query '{query}': {e}")
            continue

    # Deduplicate by URL
    seen_urls = set()
    unique_results = []
    for r in all_results:
        if r["url"] not in seen_urls:
            seen_urls.add(r["url"])
            unique_results.append(r)

    # Sort by relevance score
    unique_results.sort(key=lambda x: x.get("score", 0), reverse=True)

    return {
        "raw_results": unique_results[:15],  # top 15 for Gemini analysis
        "sources_searched": list(sources_searched),
        "queries_run": queries,
        "search_date": date.today().isoformat(),
        "total_results_found": len(unique_results),
    }


async def search_compliance_info(query: str) -> list[dict]:
    """
    Targeted search for compliance/tax info on authoritative gov sources.
    """
    tavily = get_tavily()

    compliance_domains = [
        "irs.gov",
        "ftb.ca.gov",
        "cdtfa.ca.gov",
        "edd.ca.gov",
        "dir.ca.gov",
        "dosh.dir.ca.gov",
        "sandiegocounty.gov",
    ]

    try:
        result = tavily.search(
            query=query,
            search_depth="advanced",
            include_domains=compliance_domains,
            max_results=5,
        )
        return result.get("results", [])
    except Exception as e:
        logger.error(f"Compliance search error: {e}")
        return []
