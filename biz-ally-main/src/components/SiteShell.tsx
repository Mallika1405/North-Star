import { Link, useRouterState } from "@tanstack/react-router";
import { AbstractBackdrop } from "./AbstractBackdrop";
import { authStore } from "@/lib/auth";

const nav = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/advisors/grant", label: "Advisors" },
  { to: "/grants", label: "Funding" },
  { to: "/applications", label: "Applications" },
  { to: "/settings", label: "Settings" },
];

export function SiteShell({ children, variant }: { children: React.ReactNode; variant?: "paper" }) {
  const { location } = useRouterState();
  const isLoggedIn = authStore.isLoggedIn();

  return (
    <div className="relative min-h-screen text-foreground">
      <AbstractBackdrop variant={variant ?? "paper"} />
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to={isLoggedIn ? "/dashboard" : "/"} className="flex items-center gap-3">
            <span
              aria-hidden
              className="grid h-8 w-8 place-items-center rounded-md border border-border/70 text-foreground text-base"
              style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}
            >
              ★
            </span>
            <span className="text-lg tracking-[0.3em] text-foreground" style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}>
              NORTH STAR
            </span>
          </Link>

          {isLoggedIn ? (
            <>
              <nav className="hidden gap-7 md:flex">
                {nav.map((n) => {
                  const active = location.pathname.startsWith(n.to);
                  return (
                    <Link
                      key={n.to}
                      to={n.to}
                      className={`text-[11px] uppercase tracking-[0.25em] transition-colors ${active ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {n.label}
                    </Link>
                  );
                })}
              </nav>
              <button
                onClick={() => authStore.logout()}
                className="rounded-full border border-border/70 bg-card/60 px-5 py-2 text-[11px] uppercase tracking-[0.25em] text-foreground/90 backdrop-blur transition hover:bg-card"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="rounded-full border border-border/70 bg-card/60 px-5 py-2 text-[11px] uppercase tracking-[0.25em] text-foreground/90 shadow-[0_4px_18px_-8px_rgba(186,80,90,0.45)] backdrop-blur transition hover:bg-card"
            >
              Get started
            </Link>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
      <footer className="mx-auto max-w-6xl border-t border-border/50 px-6 py-10 text-xs text-muted-foreground">
        <p>© North Star — built for small business owners in California.</p>
        <p className="mt-2 tracking-[0.3em]">SAN DIEGO</p>
      </footer>
    </div>
  );
}

export function GlassCard({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-3xl border border-border/60 bg-card/80 p-6 shadow-[0_10px_40px_-20px_rgba(40,30,80,0.18)] backdrop-blur-sm ${className}`}>
      {children}
    </div>
  );
}