import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SiteShell, GlassCard } from "@/components/SiteShell";
import { useState } from "react";
import { authStore } from "@/lib/auth";
import { profile } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Welcome — North Star" },
      { name: "description", content: "Your business advisor. Every claim sourced." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { toast.error("Please enter your email and password."); return; }
    setLoading(true);
    try {
      if (mode === "signup") {
        await authStore.signup(email, password, "en");
        const existingProfile = await profile.get();
        nav({ to: existingProfile ? "/dashboard" : "/onboarding" });
      } else {
        await authStore.login(email, password);
        const existingProfile = await profile.get();
        nav({ to: existingProfile ? "/dashboard" : "/onboarding" });
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SiteShell variant="paper">
      <div className="mx-auto max-w-md py-10">
        <div className="mb-8 text-center">
          <span className="text-4xl">★</span>
          <h1 className="mt-3 text-4xl md:text-5xl" style={{ fontFamily: "var(--font-display)" }}>
            Welcome to <span className="text-primary" style={{ fontFamily: "var(--font-script)" }}>North Star</span>
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Your AI business advisor. Grants, taxes, contracts, operations — every claim sourced. Built for small business owners in California.
          </p>
        </div>
        <GlassCard>
          <p className="text-xs uppercase tracking-[0.3em] text-primary" style={{ fontFamily: "var(--font-mono-disp)" }}>
            {mode === "signin" ? "welcome back" : "create your account"}
          </p>
          <h2 className="mt-2 text-3xl">{mode === "signin" ? "Sign in" : "Sign up"}</h2>
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <Field label="Email" type="email" value={email} onChange={setEmail} disabled={loading} />
            <Field label="Password" type="password" value={password} onChange={setPassword} disabled={loading} />
            <button type="submit" disabled={loading}
              className="mt-2 w-full rounded-full bg-primary py-3 text-sm uppercase tracking-[0.25em] text-primary-foreground disabled:opacity-60"
              style={{ fontFamily: "var(--font-mono-disp)" }}>
              {loading ? "please wait…" : mode === "signin" ? "sign in" : "get started"}
            </button>
          </form>
          <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-6 w-full text-center text-sm text-muted-foreground hover:text-foreground">
            {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>
        </GlassCard>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          No lawyers. No accountants. No grant writers. <span className="text-primary">Just you, with the right information.</span>
        </p>
      </div>
    </SiteShell>
  );
}

function Field({ label, type = "text", value, onChange, disabled }: {
  label: string; type?: string; value: string; onChange: (v: string) => void; disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-[0.25em] text-muted-foreground" style={{ fontFamily: "var(--font-mono-disp)" }}>{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
        className="mt-2 w-full rounded-md border border-border/60 bg-input/60 px-4 py-2.5 outline-none focus:border-primary disabled:opacity-60" />
    </label>
  );
}