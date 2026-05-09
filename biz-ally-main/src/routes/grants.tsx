import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SiteShell, GlassCard } from "@/components/SiteShell";
import { useState } from "react";
import { grants as grantsApi, type GrantSearchResult } from "@/lib/api";
import { authStore } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/grants")({
  head: () => ({ meta: [{ title: "Grant discovery — North Star" }] }),
  component: GrantsPage,
});

function GrantsPage() {
  const nav = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GrantSearchResult[]>([]);
  const [searchNote, setSearchNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [trackingId, setTrackingId] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authStore.isLoggedIn()) { nav({ to: "/login" }); return; }
    setLoading(true);
    try {
      const res = await grantsApi.search("en", query || undefined);
      setResults(res.results);
      setSearchNote(res.search_note);
      if (res.results.length === 0) toast.info("No grants found matching your profile right now. Try different keywords.");
    } catch {
      toast.error("Search failed. Please try again.");
    } finally { setLoading(false); }
  };

  const handleTrack = async (g: GrantSearchResult) => {
    if (!authStore.isLoggedIn()) { nav({ to: "/login" }); return; }
    setTrackingId(g.grant_name);
    try {
      await grantsApi.createApplication({
        grant_name: g.grant_name,
        grant_provider: g.provider,
        grant_url: g.url,
        award_amount_text: g.award_amount_text ?? undefined,
        eligibility_summary: g.eligibility_summary,
      });
      toast.success(`"${g.grant_name}" added to your applications.`);
      nav({ to: "/applications" });
    } catch {
      toast.error("Could not track this grant. Please try again.");
    } finally { setTrackingId(null); }
  };

  const confidenceColor = (c: string) => c === "high" ? "text-green-700 border-green-300 bg-green-50" : c === "medium" ? "text-amber-700 border-amber-300 bg-amber-50" : "text-muted-foreground border-border/50";

  return (
    <SiteShell variant="paper">
      <h1 className="text-4xl md:text-5xl">
        Grant <span className="text-primary" style={{ fontFamily: "var(--font-script)" }}>discovery</span>
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Live search — never a static database. If a page is down or a deadline has passed, we say so.
      </p>

      <GlassCard className="mt-6">
        <form className="flex flex-wrap gap-3" onSubmit={handleSearch}>
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Add keywords — your profile auto-applies (industry, location, demographics)"
            className="flex-1 min-w-[260px] rounded-full border border-border/60 bg-input/60 px-5 py-3 outline-none focus:border-primary" />
          <button type="submit" disabled={loading}
            className="rounded-full bg-primary px-7 py-3 text-xs uppercase tracking-[0.2em] text-primary-foreground disabled:opacity-60"
            style={{ fontFamily: "var(--font-mono-disp)" }}>
            {loading ? "searching…" : "search"}
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {["sba.gov", "grants.gov", "calosba.ca.gov", "California Competes", "SBDC"].map((s) => (
            <span key={s} className="rounded-full border border-border/40 px-3 py-1 text-muted-foreground" style={{ fontFamily: "var(--font-mono-disp)" }}>{s}</span>
          ))}
        </div>
      </GlassCard>

      {searchNote && <p className="mt-4 text-xs text-muted-foreground">{searchNote}</p>}

      {results.length > 0 && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {results.map((g) => (
            <GlassCard key={g.grant_name}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl">{g.grant_name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{g.provider}</p>
                  {(g.award_amount_text || g.deadline_text) && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {g.award_amount_text}{g.award_amount_text && g.deadline_text && " · "}{g.deadline_text && `due ${g.deadline_text}`}
                    </p>
                  )}
                </div>
                <span className={`flex-shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.2em] ${confidenceColor(g.confidence)}`} style={{ fontFamily: "var(--font-mono-disp)" }}>
                  {g.confidence}
                </span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{g.eligibility_summary}</p>
              <p className="mt-2 text-sm text-primary/80 italic">"{g.why_you_qualify}"</p>
              <div className="mt-4 flex items-center justify-between">
                <a href={g.url} target="_blank" rel="noopener noreferrer" className="text-xs underline text-muted-foreground hover:text-foreground">
                  {new URL(g.url).hostname} ↗
                </a>
                <button onClick={() => handleTrack(g)} disabled={trackingId === g.grant_name}
                  className="rounded-full bg-primary px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-primary-foreground disabled:opacity-60"
                  style={{ fontFamily: "var(--font-mono-disp)" }}>
                  {trackingId === g.grant_name ? "adding…" : "track this grant"}
                </button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {results.length === 0 && !loading && (
        <div className="mt-12 text-center">
          <p className="text-muted-foreground">Hit search to find grants matched to your profile.</p>
          <p className="mt-2 text-xs text-muted-foreground">Results are searched live — no cached data.</p>
        </div>
      )}
    </SiteShell>
  );
}