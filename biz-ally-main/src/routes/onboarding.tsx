import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SiteShell, GlassCard } from "@/components/SiteShell";
import { useState } from "react";
import { profile as profileApi, compliance, type BusinessStage } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Set up — North Star" }] }),
  component: Onboarding,
});

const stages = [
  { id: "idea", t: "Idea / Pre-MVP", d: "Concept exists, nothing built yet" },
  { id: "mvp", t: "MVP built, not operating", d: "Product exists, no revenue" },
  { id: "early", t: "Early operating", d: "Under 2 years · under $50k revenue" },
  { id: "established", t: "Established", d: "2+ years · $50k+ revenue" },
];

const industryOptions = ["food_truck","restaurant","retail","cleaning","alterations","beauty","childcare","construction","consulting","tech","other"];
const revenueOptions = [
  { id: "pre_revenue", label: "Pre-revenue" }, { id: "under_50k", label: "Under $50k" },
  { id: "50k_250k", label: "$50k–$250k" }, { id: "250k_1m", label: "$250k–$1M" }, { id: "over_1m", label: "Over $1M" },
];
const entityOptions = [
  { id: "sole_proprietor", label: "Sole proprietor" }, { id: "llc", label: "LLC" },
  { id: "corporation", label: "Corporation" }, { id: "s_corp", label: "S-Corp" },
  { id: "partnership", label: "Partnership" }, { id: "not_yet_formed", label: "Not yet formed" },
];

const GOALS = [
  { id: "find_grants_funding", label: "Find grants & funding", desc: "Grants, pitch competitions, investors, subsidies" },
  { id: "understand_taxes", label: "Understand my taxes & deductions", desc: "What I owe, what I can deduct, key deadlines" },
  { id: "review_contract", label: "Review a contract or lease", desc: "Plain-language explanations, unusual clause flags" },
  { id: "hire_employee", label: "Hire my first employee", desc: "California hiring steps, payroll, compliance" },
  { id: "health_inspection", label: "Respond to a health inspection", desc: "What to do first, how to address violations" },
  { id: "pitch_competitions_networking", label: "Find pitch competitions & networking", desc: "Y Combinator, Techstars, local events, deadlines" },
  { id: "connect_investors", label: "Connect with investors", desc: "Angel investors, accelerators, venture programs" },
  { id: "grow_customers", label: "Grow my customer base", desc: "Marketing, reviews, platforms, outreach" },
  { id: "get_certified", label: "Get certified", desc: "Woman-owned, minority-owned, LGBTQ+, veteran, 8(a)" },
  { id: "learn_build_skills", label: "Learn & build skills", desc: "SBDC workshops, SCORE mentorship, online resources" },
  { id: "something_else", label: "Something else", desc: "Tell us what you're trying to accomplish" },
];

function Onboarding() {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [categorizingGoal, setCategorizingGoal] = useState(false);

  const [stage, setStage] = useState<BusinessStage>("" as BusinessStage);
  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("");
  const [city, setCity] = useState("");
  const [monthsOperating, setMonthsOperating] = useState("");
  const [revenueRange, setRevenueRange] = useState("");
  const [entityType, setEntityType] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [demographics, setDemographics] = useState({
    is_woman_owned: false, is_minority_owned: false, is_veteran_owned: false,
    is_immigrant_owned: false, is_low_income_area: false, is_lgbtq_owned: false,
  });
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [otherGoalText, setOtherGoalText] = useState("");
  const [categorizedGoals, setCategorizedGoals] = useState<string[]>([]);

  const toggleGoal = (id: string) => {
    setSelectedGoals((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
  };

  const handleCategorizeGoal = async () => {
    if (!otherGoalText.trim()) return;
    setCategorizingGoal(true);
    try {
      const res = await fetch("http://localhost:8000/profile/categorize-goal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("negocio_token")}`,
        },
        body: JSON.stringify({ text: otherGoalText }),
      });
      const data = await res.json();
      const newGoals = data.matched_goals || [];
      setCategorizedGoals(newGoals);
      setSelectedGoals((prev) => [...new Set([...prev.filter(g => g !== "something_else"), ...newGoals])]);
      toast.success(`We mapped your goal to: ${newGoals.map((g: string) => GOALS.find(gl => gl.id === g)?.label ?? g).join(", ")}`);
    } catch {
      toast.error("Could not categorize goal. We'll add it as-is.");
    } finally { setCategorizingGoal(false); }
  };

  const handleFinish = async () => {
    if (!stage) { toast.error("Please select your business stage."); setStep(0); return; }
    setLoading(true);
    try {
      const yearsOperating = monthsOperating ? Math.floor(parseInt(monthsOperating) / 12) : undefined;
      const finalGoals = selectedGoals.filter(g => g !== "something_else");

      await profileApi.create({
        business_stage: stage,
        business_name: businessName || undefined,
        industry: industry || undefined,
        city: city || undefined,
        state: "CA",
        years_operating: yearsOperating,
        annual_revenue_range: revenueRange as never || undefined,
        entity_type: entityType as never || undefined,
        business_description: businessDescription || undefined,
        is_woman_owned: demographics.is_woman_owned,
        is_minority_owned: demographics.is_minority_owned,
        is_veteran_owned: demographics.is_veteran_owned,
        is_immigrant_owned: demographics.is_immigrant_owned,
        is_low_income_area: demographics.is_low_income_area,
        goals: finalGoals.length > 0 ? finalGoals : undefined,
        goals_other: otherGoalText || undefined,
      });
      compliance.seedTaxDeadlines().catch(() => {});
      toast.success("Profile created! Your North Star is ready.");
      nav({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save profile. Please try again.");
    } finally { setLoading(false); }
  };

  const STEP_TITLES = [
    "Where are you starting from?",
    "Tell us about your business",
    "About you as a business owner",
    "What are you trying to accomplish?",
  ];
  const STEP_DESCS = [
    "Everything — funding, tax advice, compliance — adapts to your stage.",
    "The more you share, the more personalized your advisor becomes.",
    "Used to surface funding you actually qualify for. Completely optional.",
    "Select everything that applies. We'll tailor your dashboard and advisor to match.",
  ];

  return (
    <SiteShell variant="paper">
      <div className="mx-auto max-w-2xl py-6">
        {/* Progress bar */}
        <div className="mb-6 flex gap-1.5">
          {[0,1,2,3].map((i) => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= step ? "bg-primary" : "bg-border/40"}`} />
          ))}
        </div>
        <p className="text-xs uppercase tracking-[0.3em] text-primary" style={{ fontFamily: "var(--font-mono-disp)" }}>
          step {step + 1} of 4
        </p>
        <h1 className="mt-2 text-4xl md:text-5xl">{STEP_TITLES[step]}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{STEP_DESCS[step]}</p>

        <div className="mt-8 space-y-6">
          {step === 0 && (
            <div className="grid gap-3 md:grid-cols-2">
              {stages.map((s) => (
                <button key={s.id} onClick={() => setStage(s.id as BusinessStage)}
                  className={`rounded-2xl border p-5 text-left transition ${stage === s.id ? "border-primary bg-primary/15" : "border-border/50 bg-card/40 hover:border-primary/60"}`}>
                  <p className="text-base font-medium">{s.t}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{s.d}</p>
                </button>
              ))}
            </div>
          )}

          {step === 1 && (
            <GlassCard>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Business name" value={businessName} onChange={setBusinessName} />
                <div>
                  <span className="block text-xs uppercase tracking-[0.25em] text-muted-foreground" style={{ fontFamily: "var(--font-mono-disp)" }}>Industry</span>
                  <select value={industry} onChange={(e) => setIndustry(e.target.value)}
                    className="mt-2 w-full rounded-md border border-border/60 bg-input/60 px-4 py-2.5 outline-none focus:border-primary">
                    <option value="">Select industry</option>
                    {industryOptions.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
                  </select>
                </div>
                <Field label="City / county" placeholder="e.g. Logan Heights, San Diego" value={city} onChange={setCity} />
                <Field label="Months in business" placeholder="e.g. 18" type="number" value={monthsOperating} onChange={setMonthsOperating} />
                <div>
                  <span className="block text-xs uppercase tracking-[0.25em] text-muted-foreground" style={{ fontFamily: "var(--font-mono-disp)" }}>Annual revenue</span>
                  <select value={revenueRange} onChange={(e) => setRevenueRange(e.target.value)}
                    className="mt-2 w-full rounded-md border border-border/60 bg-input/60 px-4 py-2.5 outline-none focus:border-primary">
                    <option value="">Select range</option>
                    {revenueOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <span className="block text-xs uppercase tracking-[0.25em] text-muted-foreground" style={{ fontFamily: "var(--font-mono-disp)" }}>Entity type</span>
                  <select value={entityType} onChange={(e) => setEntityType(e.target.value)}
                    className="mt-2 w-full rounded-md border border-border/60 bg-input/60 px-4 py-2.5 outline-none focus:border-primary">
                    <option value="">Select entity</option>
                    {entityOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <span className="block text-xs uppercase tracking-[0.25em] text-muted-foreground" style={{ fontFamily: "var(--font-mono-disp)" }}>Describe your business (2-3 sentences)</span>
                  <textarea value={businessDescription} onChange={(e) => setBusinessDescription(e.target.value)}
                    placeholder="A food truck serving Logan Heights and surrounding neighborhoods in San Diego, specializing in authentic Mexican street food…"
                    rows={3}
                    className="mt-2 w-full rounded-md border border-border/60 bg-input/60 px-4 py-2.5 outline-none focus:border-primary resize-none" />
                </div>
              </div>
            </GlassCard>
          )}

          {step === 2 && (
            <GlassCard>
              <div className="grid gap-2 md:grid-cols-2">
                {[
                  { key: "is_woman_owned", label: "Woman-owned" },
                  { key: "is_minority_owned", label: "Minority-owned" },
                  { key: "is_veteran_owned", label: "Veteran-owned" },
                  { key: "is_immigrant_owned", label: "Immigrant-owned" },
                  { key: "is_low_income_area", label: "Located in a low-income community" },
                  { key: "is_lgbtq_owned", label: "LGBTQ+-owned" },
                ].map(({ key, label }) => (
                  <label key={key} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/50 bg-card/30 p-3 hover:border-primary/60">
                    <input type="checkbox" checked={demographics[key as keyof typeof demographics]}
                      onChange={() => setDemographics(d => ({ ...d, [key]: !d[key as keyof typeof demographics] }))}
                      className="h-4 w-4 accent-[var(--primary)]" />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Only used to match you with funding you qualify for. Never shared or sold.
              </p>
            </GlassCard>
          )}

          {step === 3 && (
            <div className="grid gap-2 md:grid-cols-2">
              {GOALS.map((g) => (
                <button key={g.id} onClick={() => toggleGoal(g.id)}
                  className={`rounded-2xl border p-4 text-left transition ${selectedGoals.includes(g.id) ? "border-primary bg-primary/15" : "border-border/50 bg-card/40 hover:border-primary/60"}`}>
                  <p className="text-sm font-medium">{g.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{g.desc}</p>
                </button>
              ))}

              {selectedGoals.includes("something_else") && (
                <div className="md:col-span-2 mt-2">
                  <label className="block">
                    <span className="block text-xs uppercase tracking-[0.25em] text-muted-foreground" style={{ fontFamily: "var(--font-mono-disp)" }}>
                      What are you trying to accomplish?
                    </span>
                    <div className="mt-2 flex gap-2">
                      <input value={otherGoalText} onChange={(e) => setOtherGoalText(e.target.value)}
                        placeholder="e.g. I want to get my food truck on DoorDash and find a commercial kitchen…"
                        className="flex-1 rounded-md border border-border/60 bg-input/60 px-4 py-2.5 outline-none focus:border-primary" />
                      <button onClick={handleCategorizeGoal} disabled={categorizingGoal || !otherGoalText.trim()}
                        className="rounded-full bg-primary px-4 py-2 text-xs uppercase tracking-[0.2em] text-primary-foreground disabled:opacity-60"
                        style={{ fontFamily: "var(--font-mono-disp)" }}>
                        {categorizingGoal ? "thinking…" : "categorize"}
                      </button>
                    </div>
                  </label>
                  {categorizedGoals.length > 0 && (
                    <p className="mt-2 text-xs text-primary">
                      Mapped to: {categorizedGoals.map(g => GOALS.find(gl => gl.id === g)?.label ?? g).join(", ")}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-8 flex justify-between">
          <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || loading}
            className="rounded-full border border-border/60 px-6 py-2.5 text-xs uppercase tracking-[0.25em] disabled:opacity-40"
            style={{ fontFamily: "var(--font-mono-disp)" }}>back</button>
          <button onClick={() => step < 3 ? setStep(step + 1) : handleFinish()} disabled={loading}
            className="rounded-full bg-primary px-6 py-2.5 text-xs uppercase tracking-[0.25em] text-primary-foreground disabled:opacity-60"
            style={{ fontFamily: "var(--font-mono-disp)" }}>
            {loading ? "saving…" : step < 3 ? "continue →" : "finish — let's go"}
          </button>
        </div>
      </div>
    </SiteShell>
  );
}

function Field({ label, placeholder, type = "text", value, onChange }: {
  label: string; placeholder?: string; type?: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-[0.25em] text-muted-foreground" style={{ fontFamily: "var(--font-mono-disp)" }}>{label}</span>
      <input type={type} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-md border border-border/60 bg-input/60 px-4 py-2.5 outline-none focus:border-primary" />
    </label>
  );
}