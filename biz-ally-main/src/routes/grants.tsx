import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SiteShell, GlassCard } from "@/components/SiteShell";
import { useState, useEffect } from "react";
import { grants as grantsApi, type GrantSearchResult } from "@/lib/api";
import { authStore } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/grants")({
  head: () => ({ meta: [{ title: "Funding — North Star" }] }),
  component: FundingPage,
});

const CATEGORY_META: Record<string, { label: string; desc: string }> = {
  grants:            { label: "Grants",                        desc: "Direct funding from government agencies and foundations" },
  accelerators:      { label: "Accelerators & Incubators",     desc: "Y Combinator, Techstars, 500 Startups, and regional programs" },
  conferences:       { label: "Conferences & Networking",      desc: "Events, workshops, summits, and SBDC programs near you" },
  pitch_competitions:{ label: "Pitch Competitions",            desc: "Competitions with prize money and non-dilutive funding" },
  subsidies:         { label: "Subsidies & Tax Credits",       desc: "California Competes, energy rebates, CDFI programs" },
  investor_programs: { label: "Investor Programs",             desc: "Angel networks, seed funds, and impact investor programs" },
};

type CategorizedResults = Record<string, GrantSearchResult[]>;

function FundingPage() {
  const nav = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CategorizedResults>({});
  const [searchNote, setSearchNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [trackingId, setTrackingId] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const CACHE_KEY = "northstar_funding_cache";
  const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

  // Auto-search on mount.
  // Cache is used only when navigating back within the same page session (not on refresh).
  // window.performance.navigation.type === 1 means the page was reloaded.
  useEffect(() => {
    if (!authStore.isLoggedIn()) { nav({ to: "/login" }); return; }

    const isHardRefresh = !sessionStorage.getItem("northstar_page_loaded");
    sessionStorage.setItem("northstar_page_loaded", "1");

    // On hard refresh or first load, always search fresh
    if (isHardRefresh) {
      sessionStorage.removeItem(CACHE_KEY);
      runSearch("");
      return;
    }

    // On soft navigation (clicking Funding in nav), use cache if fresh and non-empty
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const { results: cachedResults, note, timestamp } = JSON.parse(cached);
        const total = Object.values(cachedResults).reduce((s: number, a) => s + (a as unknown[]).length, 0);
        if (Date.now() - timestamp < CACHE_TTL_MS && total > 0) {
          setResults(cachedResults);
          setSearchNote(note + " (cached — hit Refine to update)");
          setHasSearched(true);
          return;
        }
      } catch { /* invalid cache, ignore */ }
    }
    sessionStorage.removeItem(CACHE_KEY);
    runSearch("");
  }, []);

  const runSearch = async (keywords: string) => {
    setLoading(true);
    setHasSearched(true);
    try {
      const token = localStorage.getItem("negocio_token");
      const res = await fetch("http://localhost:8000/grants/funding-search", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ language: "en", additional_keywords: keywords || undefined }),
        credentials: "omit",
      });
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      const newResults = data.categorized_results ?? {};
      const note = data.search_note ?? "";
      setResults(newResults);
      setSearchNote(note);
      // Cache for 30 minutes
      if (!keywords) {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({
          results: newResults, note, timestamp: Date.now()
        }));
      }
    } catch {
      toast.error("Search failed. Please try again.");
    } finally { setLoading(false); }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(query);
  };

  const handleTrack = async (g: GrantSearchResult, category: string) => {
    const key = `${category}:${g.grant_name}`;
    setTrackingId(key);
    try {
      // Parse deadline text into a date string if possible
      let deadlineDate: string | undefined;
      if (g.deadline_text) {
        const parsed = new Date(g.deadline_text);
        if (!isNaN(parsed.getTime())) {
          deadlineDate = parsed.toISOString().split("T")[0];
        }
      }
      await grantsApi.createApplication({
        grant_name: g.grant_name,
        grant_provider: g.provider,
        grant_url: g.url,
        award_amount_text: g.award_amount_text ?? undefined,
        eligibility_summary: g.eligibility_summary,
        submission_deadline: deadlineDate,
      });
      toast.success(`"${g.grant_name}" added to your applications.`);
    } catch { toast.error("Could not track this. Please try again."); }
    finally { setTrackingId(null); }
  };

  const categoriesWithResults = Object.entries(results).filter(([, arr]) => arr.length > 0);
  const totalResults = categoriesWithResults.reduce((sum, [, arr]) => sum + arr.length, 0);

  return (
    <SiteShell variant="paper">
      <div className="mb-6">
        <h1 className="text-4xl md:text-5xl">
          Funding <span className="text-primary" style={{ fontFamily: "var(--font-script)" }}>discovery</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Searched live across grants, accelerators, conferences, pitch competitions, subsidies, and investor programs.
          Deadlines through the next 6–9 months. Never a static database.
        </p>
      </div>

      {/* Search bar — optional refinement, not required */}
      <form className="flex gap-3 mb-8" onSubmit={handleSearch}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Refine by keyword — your profile already applies"
          className="flex-1 rounded-full border border-border/60 bg-input/60 px-5 py-3 outline-none focus:border-primary text-sm"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-primary px-6 py-3 text-xs uppercase tracking-[0.2em] text-primary-foreground disabled:opacity-60"
          style={{ fontFamily: "var(--font-mono-disp)" }}
        >
          {loading ? "searching…" : "refine"}
        </button>
      </form>

      {/* Loading state */}
      {loading && (
        <div className="py-20 text-center">
          <p className="text-muted-foreground">Searching across 6 funding categories…</p>
          <p className="mt-2 text-xs text-muted-foreground">Checking grants, accelerators, conferences, pitch competitions, subsidies, and investors. Takes 20–40 seconds.</p>
          <div className="mt-6 mx-auto max-w-xs">
            {Object.values(CATEGORY_META).map((c) => (
              <div key={c.label} className="mt-2 flex items-center gap-3 text-xs text-muted-foreground animate-pulse">
                <div className="h-px flex-1 bg-border/40" />
                <span>{c.label}</span>
                <div className="h-px flex-1 bg-border/40" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No results */}
      {!loading && hasSearched && totalResults === 0 && (
        <div className="py-20 text-center">
          <p className="text-muted-foreground">No results found right now.</p>
          <p className="mt-2 text-xs text-muted-foreground">Try adding keywords, or check back as new opportunities open.</p>
        </div>
      )}

      {/* Results by category */}
      {!loading && categoriesWithResults.length > 0 && (
        <>
          {searchNote && <p className="mb-6 text-xs text-muted-foreground">{searchNote}</p>}
          <div className="space-y-12">
            {categoriesWithResults.map(([category, categoryResults]) => {
              const meta = CATEGORY_META[category];
              if (!meta) return null;
              return (
                <section key={category}>
                  <div className="mb-5 border-b border-border/40 pb-3">
                    <div className="flex items-baseline justify-between">
                      <h2 className="text-2xl">{meta.label}</h2>
                      <span className="text-sm font-medium text-foreground" style={{ fontFamily: "var(--font-mono-disp)" }}>
                        {categoryResults.length} found
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{meta.desc}</p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {categoryResults.map((g) => {
                      const trackKey = `${category}:${g.grant_name}`;
                      const daysUntil = g.deadline_text ? getDaysUntil(g.deadline_text) : null;
                      const urgent = daysUntil !== null && daysUntil >= 0 && daysUntil <= 30;

                      const confidencePill = (c: string) => {
                        if (c === "high") return { label: "Likely eligible", bg: "#EAF3DE", color: "#27500A", border: "#C0DD97" };
                        if (c === "medium") return { label: "May qualify", bg: "#FAEEDA", color: "#633806", border: "#FAC775" };
                        return { label: "Worth reviewing", bg: "#FCEBEB", color: "#791F1F", border: "#F7C1C1" };
                      };
                      const pill = confidencePill(g.confidence ?? "low");

                      return (
                        <div
                          key={g.grant_name}
                          className="rounded-2xl border-2 border-border/40 bg-card/80 p-5 flex flex-col gap-3 shadow-sm"
                        >
                          {/* Header */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <h3 className="text-base font-semibold leading-snug text-foreground">{g.grant_name}</h3>
                              <p className="mt-0.5 text-xs text-muted-foreground">{g.provider}</p>
                            </div>
                            {g.confidence && (
                              <span className="flex-shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full border"
                                style={{ background: pill.bg, color: pill.color, borderColor: pill.border }}>
                                {pill.label}
                              </span>
                            )}
                          </div>

                          {/* Amount + deadline */}
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                            {g.award_amount_text && (
                              <span className="font-medium text-primary">{g.award_amount_text}</span>
                            )}
                            {g.deadline_text && (
                              <span className={urgent ? "font-medium text-[var(--maroon)]" : "text-muted-foreground"}>
                                Due {g.deadline_text}
                                {daysUntil !== null && daysUntil >= 0 && (
                                  <span className="ml-1 text-xs">({daysUntil}d)</span>
                                )}
                              </span>
                            )}
                          </div>

                          {/* Eligibility */}
                          <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                            {g.eligibility_summary}
                          </p>

                          {/* Why you qualify */}
                          {g.why_you_qualify && (
                            <p className="text-xs text-primary/80 italic border-l-2 border-primary/30 pl-3">
                              {g.why_you_qualify}
                            </p>
                          )}

                          {/* Actions */}
                          <div className="flex items-center justify-between pt-1 border-t border-border/30">
                            <a href={g.url} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
                              {safeHostname(g.url)} ↗
                            </a>
                            <button onClick={() => handleTrack(g, category)} disabled={trackingId === trackKey}
                              className="rounded-full bg-primary px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] text-primary-foreground disabled:opacity-60"
                              style={{ fontFamily: "var(--font-mono-disp)" }}>
                              {trackingId === trackKey ? "adding…" : "track"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
    </SiteShell>
  );
}

function safeHostname(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

function getDaysUntil(deadlineText: string): number | null {
  try {
    const d = new Date(deadlineText);
    if (isNaN(d.getTime())) return null;
    return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  } catch { return null; }
}