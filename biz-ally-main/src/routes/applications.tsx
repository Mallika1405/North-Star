import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SiteShell, GlassCard } from "@/components/SiteShell";
import { useEffect, useState } from "react";
import { grants as grantsApi, calendar as calendarApi, type GrantApplication, type GrantTask, type CalendarEventPreview } from "@/lib/api";
import { authStore } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/applications")({
  head: () => ({ meta: [{ title: "Applications — North Star" }] }),
  component: ApplicationsPage,
});

function ApplicationsPage() {
  const nav = useNavigate();
  const [apps, setApps] = useState<GrantApplication[]>([]);
  const [tasks, setTasks] = useState<Record<string, GrantTask[]>>({});
  const [loading, setLoading] = useState(true);
  const [decomposing, setDecomposing] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewEvents, setPreviewEvents] = useState<CalendarEventPreview[]>([]);
  const [addingToCalendar, setAddingToCalendar] = useState(false);

  useEffect(() => {
    if (!authStore.isLoggedIn()) { nav({ to: "/login" }); return; }
    async function load() {
      try {
        const appsRes = await grantsApi.listApplications();
        const active = appsRes.filter((a) => a.status !== "awarded" && a.status !== "abandoned");
        setApps(active);
        // Load tasks for each app
        const taskMap: Record<string, GrantTask[]> = {};
        await Promise.all(active.map(async (a) => {
          try { taskMap[a.id] = await grantsApi.getTasks(a.id); } catch { taskMap[a.id] = []; }
        }));
        setTasks(taskMap);
      } catch { toast.error("Could not load applications."); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const handleDecompose = async (appId: string) => {
    setDecomposing(appId);
    try {
      const newTasks = await grantsApi.decomposeTasks(appId);
      setTasks((prev) => ({ ...prev, [appId]: newTasks }));
      toast.success("Tasks generated! Review them below.");
    } catch { toast.error("Could not generate tasks. Please try again."); }
    finally { setDecomposing(null); }
  };

  const handlePreviewCalendar = async () => {
    try {
      const allPreviews: CalendarEventPreview[] = [];
      for (const app of apps) {
        try {
          const events = await grantsApi.getCalendarPreview(app.id);
          allPreviews.push(...events);
        } catch { /* skip */ }
      }
      if (allPreviews.length === 0) {
        toast.info("No pending calendar events. Generate tasks first, or all tasks are already in your calendar.");
        return;
      }
      setPreviewEvents(allPreviews);
      setShowPreview(true);
    } catch { toast.error("Could not load calendar preview."); }
  };

  const handleConfirmCalendar = async () => {
    setAddingToCalendar(true);
    try {
      // Check if calendar is connected first
      const status = await calendarApi.status();
      if (!status.connected) {
        // Store pending events so we can add them after OAuth
        sessionStorage.setItem("pending_calendar_events", JSON.stringify(previewEvents));
        // Get OAuth URL and redirect
        const { auth_url } = await calendarApi.getAuthUrl("applications");
        window.location.href = auth_url;
        return;
      }
      const res = await calendarApi.addEvents(previewEvents);
      if (res.added.length > 0) toast.success(`${res.added.length} events added to Google Calendar.`);
      if (res.failed.length > 0) toast.error(`${res.failed.length} events failed to add.`);
      setShowPreview(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not add to calendar. Please try again.");
    } finally { setAddingToCalendar(false); }
  };

  // After Google OAuth redirect back, add pending events
  // Run after loading=false so calendar token is confirmed saved
  useEffect(() => {
    if (loading) return; // wait for apps to load first
    const params = new URLSearchParams(window.location.search);
    if (params.get("calendar") === "connected") {
      window.history.replaceState({}, "", "/applications");
      const pending = sessionStorage.getItem("pending_calendar_events");
      if (pending) {
        sessionStorage.removeItem("pending_calendar_events");
        const events = JSON.parse(pending);
        toast.info("Adding events to Google Calendar…");
        calendarApi.addEvents(events).then((res) => {
          if (res.added.length > 0) toast.success(`${res.added.length} events added to Google Calendar.`);
          if (res.failed.length > 0) toast.error(`${res.failed.length} events failed.`);
        }).catch((err) => toast.error("Could not add events: " + (err?.message ?? "unknown error")));
      } else {
        toast.success("Google Calendar connected!");
      }
    }
  }, [loading]);

  return (
    <SiteShell variant="paper">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl md:text-5xl">Applications</h1>
          <p className="mt-2 text-sm text-muted-foreground">Cross-grant tasks are batched. Hard deadlines red. Soft deadlines amber.</p>
        </div>
        {apps.length > 0 && (
          <button onClick={handlePreviewCalendar}
            className="rounded-full bg-primary px-6 py-2.5 text-xs uppercase tracking-[0.2em] text-primary-foreground"
            style={{ fontFamily: "var(--font-mono-disp)" }}>
            preview calendar push
          </button>
        )}
      </div>

      {loading ? (
        <p className="mt-10 text-sm text-muted-foreground">Loading…</p>
      ) : apps.length === 0 ? (
        <GlassCard className="mt-10 text-center">
          <p className="text-muted-foreground">No active applications yet.</p>
          <a href="/grants" className="mt-3 inline-block text-xs uppercase tracking-[0.2em] text-primary underline" style={{ fontFamily: "var(--font-mono-disp)" }}>
            Find grants →
          </a>
        </GlassCard>
      ) : (
        <div className="mt-6 space-y-6">
          {apps.map((a) => {
            const appTasks = tasks[a.id] ?? [];
            return (
              <GlassCard key={a.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <h2 className="text-2xl">{a.grant_name}</h2>
                    {a.grant_provider && <p className="text-sm text-muted-foreground">{a.grant_provider}</p>}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {a.award_amount_text && `${a.award_amount_text} · `}
                    {a.submission_deadline ? `final due ${formatDate(a.submission_deadline)}` : "no deadline set"}
                  </span>
                </div>
                {a.grant_url && (
                  <a href={a.grant_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-primary underline">
                    {a.grant_url} ↗
                  </a>
                )}

                {appTasks.length === 0 ? (
                  <div className="mt-4">
                    <p className="text-sm text-muted-foreground">No tasks yet.</p>
                    <button onClick={() => handleDecompose(a.id)} disabled={decomposing === a.id}
                      className="mt-2 rounded-full border border-primary px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-primary disabled:opacity-60"
                      style={{ fontFamily: "var(--font-mono-disp)" }}>
                      {decomposing === a.id ? "generating tasks…" : "generate tasks + deadlines"}
                    </button>
                  </div>
                ) : (
                  <ul className="mt-4 divide-y divide-border/40">
                    {appTasks.map((t) => (
                      <li key={t.id} className="flex items-center justify-between py-3">
                        <div className="flex items-center gap-4">
                          <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${t.is_hard_deadline ? "bg-[var(--maroon)]" : "bg-[var(--tangerine)]"}`} />
                          <div>
                            <p className={t.is_completed ? "line-through text-muted-foreground" : ""}>{t.title}</p>
                            {t.also_serves_grant_ids.length > 0 && (
                              <p className="text-xs text-muted-foreground">shared task</p>
                            )}
                          </div>
                        </div>
                        <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground flex-shrink-0" style={{ fontFamily: "var(--font-mono-disp)" }}>
                          {formatDate(t.hard_deadline ?? t.soft_deadline ?? "")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </GlassCard>
            );
          })}
        </div>
      )}

      {/* Calendar preview modal */}
      {showPreview && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-background/70 p-4 backdrop-blur">
          <GlassCard className="w-full max-w-lg">
            <h3 className="text-2xl">Calendar push preview</h3>
            <p className="mt-1 text-sm text-muted-foreground">Nothing is added until you confirm. Red = hard deadline, amber = soft deadline.</p>
            <ul className="mt-4 max-h-72 space-y-2 overflow-auto">
              {previewEvents.map((ev, i) => (
                <li key={i} className="flex items-center justify-between rounded-lg border border-border/40 bg-card/30 px-3 py-2 text-sm">
                  <span className="flex items-center gap-3">
                    <span className={`h-2 w-2 flex-shrink-0 rounded-full ${ev.is_hard_deadline ? "bg-[var(--maroon)]" : "bg-[var(--tangerine)]"}`} />
                    <span>{ev.title}</span>
                  </span>
                  <span className="text-xs text-muted-foreground flex-shrink-0" style={{ fontFamily: "var(--font-mono-disp)" }}>
                    {formatDate(ev.start_date)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowPreview(false)}
                className="rounded-full border border-border/60 px-5 py-2 text-xs uppercase tracking-[0.2em]"
                style={{ fontFamily: "var(--font-mono-disp)" }}>cancel</button>
              <button onClick={handleConfirmCalendar} disabled={addingToCalendar}
                className="rounded-full bg-primary px-5 py-2 text-xs uppercase tracking-[0.2em] text-primary-foreground disabled:opacity-60"
                style={{ fontFamily: "var(--font-mono-disp)" }}>
                {addingToCalendar ? "adding…" : "confirm & add to calendar"}
              </button>
            </div>
          </GlassCard>
        </div>
      )}
    </SiteShell>
  );
}

function formatDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}