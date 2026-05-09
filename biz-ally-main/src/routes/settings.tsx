import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SiteShell, GlassCard } from "@/components/SiteShell";
import { useEffect, useState } from "react";
import { profile as profileApi, calendar as calendarApi, type BusinessProfile } from "@/lib/api";
import { authStore } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — North Star" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const nav = useNavigate();
  const [userProfile, setUserProfile] = useState<BusinessProfile | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("");
  const [city, setCity] = useState("");
  const [lang, setLang] = useState<"en" | "es">("en");
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authStore.isLoggedIn()) { nav({ to: "/login" }); return; }
    // Load saved language
    const savedLang = localStorage.getItem("northstar_language") as "en" | "es" | null;
    if (savedLang) setLang(savedLang);

    async function load() {
      try {
        const [prof, calStatus] = await Promise.all([profileApi.get(), calendarApi.status()]);
        if (prof) {
          setUserProfile(prof);
          setBusinessName(prof.business_name ?? "");
          setIndustry(prof.industry ?? "");
          setCity(prof.city ?? "");
        }
        setCalendarConnected(calStatus.connected);
      } catch { /* silent */ }
      finally { setLoading(false); }
    }
    load();

    // Check if redirected back from Google OAuth
    const params = new URLSearchParams(window.location.search);
    if (params.get("calendar") === "connected") {
      toast.success("Google Calendar connected!");
      setCalendarConnected(true);
      window.history.replaceState({}, "", "/settings");
    }
    if (params.get("calendar") === "error") {
      toast.error("Could not connect Google Calendar. Please try again.");
      window.history.replaceState({}, "", "/settings");
    }
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await profileApi.update({
        business_name: businessName || undefined,
        industry: industry || undefined,
        city: city || undefined,
      });
      toast.success("Profile updated.");
    } catch { toast.error("Could not save. Please try again."); }
    finally { setSaving(false); }
  };

  const handleLanguageChange = (l: "en" | "es") => {
    setLang(l);
    localStorage.setItem("northstar_language", l);
    toast.success(l === "es" ? "Idioma cambiado a Español." : "Language set to English.");
  };

  const handleConnectCalendar = async () => {
    try {
      const res = await calendarApi.getAuthUrl();
      window.location.href = res.auth_url;
    } catch { toast.error("Could not start Google Calendar authorization."); }
  };

  return (
    <SiteShell variant="paper">
      <h1 className="text-4xl md:text-5xl">Settings</h1>

      {loading ? (
        <p className="mt-10 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {/* Business profile */}
          <GlassCard>
            <h2 className="text-2xl">Business profile</h2>
            <div className="mt-4 grid gap-3">
              <Field label="Business name" value={businessName} onChange={setBusinessName} />
              <Field label="Industry" value={industry} onChange={setIndustry} placeholder="e.g. food_truck, retail, cleaning" />
              <Field label="City / location" value={city} onChange={setCity} placeholder="e.g. Logan Heights, San Diego" />
              {userProfile && (
                <div>
                  <span className="block text-xs uppercase tracking-[0.25em] text-muted-foreground" style={{ fontFamily: "var(--font-mono-disp)" }}>Stage</span>
                  <p className="mt-2 text-sm capitalize">{userProfile.business_stage.replace("_", " ")}</p>
                </div>
              )}
            </div>
            <button onClick={handleSave} disabled={saving}
              className="mt-5 rounded-full bg-primary px-5 py-2 text-xs uppercase tracking-[0.2em] text-primary-foreground disabled:opacity-60"
              style={{ fontFamily: "var(--font-mono-disp)" }}>
              {saving ? "saving…" : "save"}
            </button>
          </GlassCard>

          <div className="space-y-6">
            {/* Language */}
            <GlassCard>
              <h2 className="text-2xl">Language</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Spanish is calibrated to Latin American professional register. English legal terms appear in parentheses for cross-reference.
              </p>
              <div className="mt-4 inline-flex rounded-full border border-border/60 p-1">
                {(["en", "es"] as const).map((l) => (
                  <button key={l} onClick={() => handleLanguageChange(l)}
                    className={`rounded-full px-4 py-1.5 text-xs uppercase tracking-[0.2em] transition ${lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    style={{ fontFamily: "var(--font-mono-disp)" }}>
                    {l === "en" ? "English" : "Español"}
                  </button>
                ))}
              </div>
            </GlassCard>

            {/* Google Calendar */}
            <GlassCard>
              <h2 className="text-2xl">Google Calendar</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Required for deadline reminders. Every event is previewed before being added — nothing goes to your calendar without your confirmation.
              </p>
              {calendarConnected ? (
                <div className="mt-4 flex items-center gap-2 text-sm">
                  <span className="text-green-600">✓</span>
                  <span>Connected</span>
                </div>
              ) : (
                <button onClick={handleConnectCalendar}
                  className="mt-4 rounded-full bg-primary px-5 py-2 text-xs uppercase tracking-[0.2em] text-primary-foreground"
                  style={{ fontFamily: "var(--font-mono-disp)" }}>
                  connect google calendar
                </button>
              )}
            </GlassCard>

            {/* Scope limits */}
            <GlassCard>
              <h2 className="text-2xl">What North Star does not do</h2>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>— No advice on active IRS audits, disputes, or prior-year amendments.</li>
                <li>— No legal representation or licensed professional opinion.</li>
                <li>— No advice on healthcare billing, financial services, or food manufacturing at scale.</li>
                <li>— Grant data is live-searched at time of search, not guaranteed current at submission.</li>
              </ul>
            </GlassCard>
          </div>
        </div>
      )}
    </SiteShell>
  );
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-[0.25em] text-muted-foreground" style={{ fontFamily: "var(--font-mono-disp)" }}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="mt-2 w-full rounded-md border border-border/60 bg-input/60 px-4 py-2.5 outline-none focus:border-primary" />
    </label>
  );
}