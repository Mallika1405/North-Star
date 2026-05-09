import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { SiteShell, GlassCard } from "@/components/SiteShell";
import { useEffect, useState } from "react";
import { calendar, grants, profile as profileApi, type UpcomingEvent, type GrantApplication, type BusinessProfile } from "@/lib/api";
import { authStore } from "@/lib/auth";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — North Star" }] }),
  component: Dashboard,
});

const GOAL_ACTIONS: Record<string, { label: string; to: string; params?: Record<string, string>; desc: string }> = {
  find_grants_funding: { label: "Find funding", to: "/grants", desc: "Search grants, competitions, investors, subsidies" },
  understand_taxes: { label: "Tax advisor", to: "/advisors/$domain", params: { domain: "tax" }, desc: "Deductions, deadlines, IRS publications" },
  review_contract: { label: "Contract advisor", to: "/advisors/$domain", params: { domain: "contract" }, desc: "Upload a lease or agreement for plain-language review" },
  hire_employee: { label: "Operations advisor", to: "/advisors/$domain", params: { domain: "operations" }, desc: "California hiring steps, payroll, compliance" },
  health_inspection: { label: "Operations advisor", to: "/advisors/$domain", params: { domain: "operations" }, desc: "What to do after an inspection flag" },
  pitch_competitions_networking: { label: "Find funding", to: "/grants", desc: "Search pitch competitions and accelerator deadlines" },
  connect_investors: { label: "Find funding", to: "/grants", desc: "Search accelerators, angels, and investor programs" },
  grow_customers: { label: "Operations advisor", to: "/advisors/$domain", params: { domain: "operations" }, desc: "Reviews, platforms, outreach strategy" },
  get_certified: { label: "Find funding", to: "/grants", desc: "Certifications that unlock contracts and grants" },
  learn_build_skills: { label: "Grant advisor", to: "/advisors/$domain", params: { domain: "grant" }, desc: "SBDC workshops, SCORE mentorship, resources" },
};

function Dashboard() {
  const nav = useNavigate();
  const user = authStore.getUser();
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [apps, setApps] = useState<GrantApplication[]>([]);
  const [userProfile, setUserProfile] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authStore.isLoggedIn()) { nav({ to: "/login" }); return; }
    async function load() {
      try {
        const [eventsRes, appsRes, prof] = await Promise.all([
          calendar.upcoming(90),
          grants.listApplications(),
          profileApi.get(),
        ]);
        setEvents(eventsRes.events);
        setApps(appsRes.filter((a) => a.status !== "awarded" && a.status !== "abandoned"));
        setUserProfile(prof);
      } catch { /* silent */ } finally { setLoading(false); }
    }
    load();
  }, []);

  const hasNoActivity = !loading && events.length === 0 && apps.length === 0;
  const goals: string[] = (userProfile as any)?.goals ?? [];
  const hasGoals = goals.length > 0;

  // Build goal-based action cards
  const goalCards = hasGoals
    ? goals.slice(0, 4).map((g) => GOAL_ACTIONS[g]).filter(Boolean)
    : [
        { label: "Find funding", to: "/grants", desc: "Grants, competitions, investors, subsidies — searched live" },
        { label: "Tax advisor", to: "/advisors/$domain", params: { domain: "tax" }, desc: "Deductions, deadlines, IRS publications cited" },
        { label: "Contract advisor", to: "/advisors/$domain", params: { domain: "contract" }, desc: "Upload a lease or agreement for plain-language review" },
        { label: "Operations advisor", to: "/advisors/$domain", params: { domain: "operations" }, desc: "Hiring, reviews, inspections, supplier disputes" },
      ];

  return (
    <SiteShell variant="paper">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.3em] text-primary" style={{ fontFamily: "var(--font-mono-disp)" }}>
          welcome back{userProfile?.business_name ? ` · ${userProfile.business_name}` : ""}
        </p>
        <h1 className="mt-2 text-4xl md:text-5xl" style={{ fontFamily: "var(--font-display)" }}>
          {hasNoActivity
            ? <>Your <span className="text-primary" style={{ fontFamily: "var(--font-script)" }}>north star</span> is ready</>
            : <>Today's <span className="text-primary" style={{ fontFamily: "var(--font-script)" }}>quiet plan</span></>
          }
        </h1>
        {userProfile?.city && <p className="mt-1 text-sm text-muted-foreground">{userProfile.city}, California</p>}
      </div>

      {/* Goals-based start here */}
      {hasNoActivity && (
        <GlassCard className="mb-6 border-primary/30 bg-primary/5">
          <p className="text-xs uppercase tracking-[0.3em] text-primary" style={{ fontFamily: "var(--font-mono-disp)" }}>
            {hasGoals ? "based on your goals" : "start here"}
          </p>
          <h2 className="mt-2 text-2xl">
            {hasGoals ? "Here's where to begin" : "Where do you want to begin?"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasGoals
              ? "Your advisor is ready to help with what matters most to you right now."
              : "Your profile is set up. Pick a starting point and your advisor will guide you."}
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {goalCards.map((item, i) => (
              <Link key={i} to={item.to} params={item.params ?? {}}
                className="rounded-xl border border-border/50 bg-card/40 p-4 hover:border-primary/60 transition">
                <p className="text-sm font-medium">{item.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.desc}</p>
              </Link>
            ))}
          </div>
          {!hasGoals && (
            <p className="mt-4 text-xs text-muted-foreground">
              <Link to="/settings" className="underline">Update your goals in Settings</Link> to personalize this.
            </p>
          )}
        </GlassCard>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        {/* Upcoming deadlines */}
        <GlassCard className="md:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl">Upcoming deadlines</h2>
            <Link to="/applications" className="text-xs uppercase tracking-[0.25em] text-primary" style={{ fontFamily: "var(--font-mono-disp)" }}>view all</Link>
          </div>
          {loading ? (
            <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
          ) : events.length === 0 ? (
            <div className="mt-6">
              <p className="text-sm text-muted-foreground">No upcoming deadlines in the next 90 days.</p>
              <Link to="/advisors/$domain" params={{ domain: "tax" }} className="mt-3 inline-block text-xs uppercase tracking-[0.2em] text-primary underline" style={{ fontFamily: "var(--font-mono-disp)" }}>
                Ask the tax advisor about your filing dates →
              </Link>
            </div>
          ) : (
            <ul className="mt-5 divide-y divide-border/40">
              {events.map((ev, i) => {
                const daysUntil = Math.ceil((new Date(ev.date).getTime() - Date.now()) / 86400000);
                return (
                  <li key={i} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-4">
                      <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${ev.is_hard_deadline || ev.event_type === "tax_deadline" ? "bg-[var(--maroon)]" : "bg-[var(--tangerine)]"}`} />
                      <div>
                        <p className="text-base">{ev.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {ev.type === "compliance" ? ev.event_type?.replace(/_/g, " ") : "grant task"}
                          {daysUntil <= 14 && <span className="ml-2 text-[var(--maroon)] font-medium">{daysUntil}d left</span>}
                        </p>
                      </div>
                    </div>
                    <span className="flex-shrink-0 text-sm uppercase tracking-[0.2em] text-muted-foreground" style={{ fontFamily: "var(--font-mono-disp)" }}>
                      {formatDate(ev.date)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </GlassCard>

        {/* Advisors */}
        <GlassCard>
          <h2 className="text-2xl">Advisors</h2>
          <ul className="mt-4 space-y-2">
            {[["grant","Grant"],["tax","Tax & compliance"],["contract","Contracts"],["operations","Operations"]].map(([id, label]) => (
              <li key={id}>
                <Link to="/advisors/$domain" params={{ domain: id }}
                  className="flex items-center justify-between rounded-lg border border-border/40 bg-card/30 px-4 py-3 hover:border-primary/60 transition">
                  <span>{label}</span><span className="text-primary">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </GlassCard>
      </div>

      {/* Active funding applications */}
      <div className="mt-8">
        <GlassCard>
          <div className="flex items-center justify-between">
            <h2 className="text-2xl">Active funding applications</h2>
            <Link to="/grants" className="text-xs uppercase tracking-[0.25em] text-primary" style={{ fontFamily: "var(--font-mono-disp)" }}>find more</Link>
          </div>
          {loading ? (
            <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
          ) : apps.length === 0 ? (
            <div className="mt-6">
              <p className="text-sm text-muted-foreground">No active applications yet.</p>
              <Link to="/grants" className="mt-3 inline-block text-xs uppercase tracking-[0.2em] text-primary underline" style={{ fontFamily: "var(--font-mono-disp)" }}>
                Search for funding →
              </Link>
            </div>
          ) : (
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {apps.slice(0, 3).map((a) => (
                <div key={a.id} className="rounded-xl border border-border/40 bg-card/30 p-4">
                  <p className="text-base">{a.grant_name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {a.award_amount_text && `${a.award_amount_text} · `}
                    {a.submission_deadline ? `due ${formatDate(a.submission_deadline)}` : "no deadline set"}
                  </p>
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-secondary/60">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${statusPercent(a.status)}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground capitalize">{a.status.replace(/_/g, " ")}</p>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>
    </SiteShell>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function statusPercent(status: string) {
  return ({ researching: 10, in_progress: 50, submitted: 85, awarded: 100, declined: 100, abandoned: 0 } as Record<string, number>)[status] ?? 0;
}