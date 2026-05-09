import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteShell, GlassCard } from "@/components/SiteShell";
import advisorChar from "@/assets/advisor-character.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Negocio — An AI advisor for small business owners" },
      { name: "description", content: "The professional infrastructure that used to require a lawyer, an accountant, and a grant writer — now in plain language." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <SiteShell variant="paper">
      {/* HERO */}
      <section className="grid gap-10 py-8 md:grid-cols-12 md:py-16">
        <div className="md:col-span-7">
          <p className="mb-6 text-[11px] uppercase tracking-[0.45em] text-muted-foreground">
            an advisor — for the rest of us
          </p>
          <h1 className="leading-[0.95]">
            <span className="block text-5xl italic text-muted-foreground/80 md:text-7xl" style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 500 }}>
              Grants found.
            </span>
            <span className="block font-script text-5xl text-primary md:text-7xl" style={{ fontFamily: "var(--font-script)" }}>
              Paperwork tamed.
            </span>
          </h1>
          <p className="mt-8 max-w-xl text-lg leading-relaxed text-foreground/80">
            The professional infrastructure that used to require a lawyer, an accountant, and a grant writer — now in plain language. Built for the food truck in Logan Heights and the founder with an MVP and a question.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              to="/onboarding"
              className="rounded-full bg-card/90 px-7 py-3 text-sm tracking-wide text-foreground shadow-[0_8px_24px_-10px_rgba(186,80,90,0.55)] ring-1 ring-accent/50 transition hover:shadow-[0_8px_28px_-8px_rgba(186,80,90,0.7)]"
            >
              Start your profile <span className="ml-2 opacity-60">→</span>
            </Link>
            <Link
              to="/grants"
              className="rounded-full border border-border/80 bg-background/40 px-7 py-3 text-sm tracking-wide text-foreground transition hover:bg-card/60"
            >
              See a live grant search
            </Link>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-6 text-sm">
            <span className="text-primary">Latina-owned</span>
            <span className="text-foreground/70">Sources cited</span>
            <span className="rounded-full border border-border/70 bg-background/40 px-4 py-1 text-foreground/70">Free to use</span>
          </div>
        </div>

        <div className="md:col-span-5">
          <GlassCard className="flex h-full flex-col items-center justify-end bg-card/60 px-4 pt-8">
            <img src={advisorChar} alt="Negocio advisor character" className="h-72 w-auto object-contain md:h-96" />
          </GlassCard>
        </div>
      </section>

      {/* DRAFTS / DEADLINES PEEK */}
      <section className="py-6">
        <GlassCard className="mx-auto max-w-xl">
          <p className="text-[11px] uppercase tracking-[0.35em] text-muted-foreground">today's drafts</p>
          <ul className="mt-4 divide-y divide-border/50">
            <li className="flex items-center justify-between py-3">
              <span>CalCompetes narrative</span>
              <span className="text-sm text-muted-foreground">Soft · Tue</span>
            </li>
            <li className="flex items-center justify-between py-3">
              <span>Q3 estimated tax (1040-ES)</span>
              <span className="text-sm text-primary">Hard · Sep 16</span>
            </li>
            <li className="flex items-center justify-between py-3">
              <span>Supplier contract review</span>
              <span className="text-sm text-primary">Flagged</span>
            </li>
          </ul>
        </GlassCard>
      </section>

      {/* STAGE PICKER */}
      <section className="py-16">
        <p className="text-[11px] uppercase tracking-[0.35em] text-primary">step 01 — pick your stage</p>
        <h2 className="mt-3 max-w-3xl text-4xl italic md:text-5xl" style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}>
          Same product. Different shape for where you are.
        </h2>
        <p className="mt-4 max-w-2xl text-foreground/75">
          A pre-revenue founder gets SBIR/STTR discovery and entity guidance. A 3-year-old food truck gets operating grants and quarterly tax deadlines.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {[
            ["01", "Idea", "Concept exists, nothing built"],
            ["02", "MVP built", "Product exists, no revenue"],
            ["03", "Early operating", "<2 yrs, <$50k revenue"],
            ["04", "Established", "2+ yrs, $50k+ revenue"],
          ].map(([n, t, d]) => (
            <GlassCard key={n} className="!p-7">
              <p className="text-[11px] tracking-[0.3em] text-muted-foreground">{n}</p>
              <h3 className="mt-3 text-2xl" style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}>{t}</h3>
              <p className="mt-2 text-sm text-foreground/70">{d}</p>
            </GlassCard>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section className="py-12">
        <p className="font-script text-3xl text-primary md:text-4xl" style={{ fontFamily: "var(--font-script)" }}>
          What you actually get —
        </p>
        <h2 className="mt-1 text-4xl italic md:text-5xl" style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}>
          Five tools, every claim sourced.
        </h2>

        <div className="mt-10 space-y-5">
          {[
            { n: "01", t: "Grants & funding, found live", d: "We search SBA.gov, Grants.gov, CalOSBA, SBDC and California Competes against your profile — eligibility, awards, deadlines, in plain language.", s: "grants.gov · sba.gov" },
            { n: "02", t: "Project plan + your calendar", d: "Every grant becomes tasks with soft & hard deadlines. Overlapping document work batches across applications. Preview before anything hits Google Calendar.", s: "Google Calendar" },
            { n: "03", t: "Taxes & compliance, cited", d: "IRS Pub 334, 535, 946, 15. CDTFA, FTB, Labor Commissioner, EDD. Four plain-language questions for every form. Linked, not paraphrased.", s: "IRS Pub. 334" },
            { n: "04", t: "Contracts read for you", d: "Upload a lease or supplier agreement. We explain each clause, flag what's non-standard against UCC and California Civil Code, and surface free legal aid when it matters.", s: "selfhelp.courts.ca.gov" },
            { n: "05", t: "The hard daily stuff", d: "Hire your first employee, respond to a Yelp review, push back on a late payment, prep for a re-inspection. We say when we're citing law and when we're reasoning.", s: "ca.gov · CalOSHA" },
          ].map((f) => (
            <GlassCard key={f.n}>
              <p className="text-[11px] tracking-[0.3em] text-muted-foreground">FEATURE {f.n}</p>
              <h3 className="mt-3 text-2xl" style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}>{f.t}</h3>
              <p className="mt-3 max-w-3xl text-foreground/80">{f.d}</p>
              <div className="mt-5 border-t border-dashed border-border/60 pt-3 text-sm text-foreground/60">
                <span className="text-muted-foreground">Source: </span>
                <span className="text-[color:var(--sage)]">{f.s}</span>
              </div>
            </GlassCard>
          ))}
        </div>
      </section>

      {/* HONEST */}
      <section className="py-12">
        <p className="text-[11px] uppercase tracking-[0.35em] text-primary">honest by design</p>
        <h2 className="mt-3 text-4xl italic md:text-5xl" style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}>
          What we won't do.
        </h2>
        <ul className="mt-6 space-y-2 text-foreground/80">
          {[
            "No advice on active IRS audits or amendments",
            "No legal representation — we route to Legal Aid SD, SCORE, USD & Cal Western",
            "No specialist regulation (healthcare billing, finance)",
            "Grants are live-searched — we tell you when a page is stale",
          ].map((l) => (
            <li key={l} className="before:mr-3 before:text-primary before:content-['—']">{l}</li>
          ))}
        </ul>
      </section>

      {/* CTA */}
      <section className="py-16">
        <GlassCard className="grid gap-8 md:grid-cols-5 md:items-center">
          <div className="md:col-span-3">
            <h2 className="text-4xl italic md:text-5xl" style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}>
              Let's find the grants you're already eligible for.
            </h2>
            <p className="mt-4 max-w-xl text-foreground/75">
              Five minutes to a profile. A real search against live sources. Every link goes back to the original page.
            </p>
            <Link
              to="/onboarding"
              className="mt-8 inline-flex rounded-full bg-card/90 px-7 py-3 text-sm tracking-wide text-foreground shadow-[0_8px_24px_-10px_rgba(186,80,90,0.55)] ring-1 ring-accent/50 transition"
            >
              Start your profile <span className="ml-2 opacity-60">→</span>
            </Link>
          </div>
          <div className="md:col-span-2">
            <img src={advisorChar} alt="" className="mx-auto h-56 w-auto object-contain md:h-72" />
          </div>
        </GlassCard>
      </section>
    </SiteShell>
  );
}
