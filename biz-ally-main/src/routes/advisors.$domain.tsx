import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { SiteShell, GlassCard } from "@/components/SiteShell";
import { useState, useEffect, useRef } from "react";
import { chat as chatApi, type Message, type Conversation, type Language, type AdvisorDomain } from "@/lib/api";
import { authStore } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/advisors/$domain")({
  head: ({ params }) => {
    const titles: Record<string, string> = { grant: "Grant advisor", tax: "Tax & compliance advisor", contract: "Contract advisor", operations: "Operations advisor" };
    const t = titles[params.domain] ?? "Advisor";
    return { meta: [{ title: `${t} — North Star` }] };
  },
  component: AdvisorPage,
});

const meta: Record<string, { t: string; sub: string; placeholder: string; sources: string[] }> = {
  grant: { t: "Grant advisor", sub: "Live discovery from SBA, Grants.gov, CalOSBA, SBDC, California Competes.", placeholder: "Find grants for my business…", sources: ["sba.gov", "grants.gov", "calosba.ca.gov"] },
  tax: { t: "Tax & compliance", sub: "IRS Pubs 334, 535, 946, 15 · CDTFA · FTB · Labor Commissioner · EDD.", placeholder: "What can I deduct as a food truck owner?", sources: ["irs.gov", "cdtfa.ca.gov", "ftb.ca.gov"] },
  contract: { t: "Contract advisor", sub: "Upload a lease, supplier, ToS, or contractor agreement. Flags unusual clauses against UCC and California Civil Code.", placeholder: "Ask a question about the contract, or upload a PDF above…", sources: ["UCC", "Cal. Civil Code", "selfhelp.courts.ca.gov"] },
  operations: { t: "Operations advisor", sub: "Day-to-day. Hiring · health inspection · supplier disputes · review responses.", placeholder: "I just got a 1-star Yelp review — how do I respond?", sources: ["Cal. Labor Comm.", "CalOSHA", "SD County DEH"] },
};

function AdvisorPage() {
  const { domain } = useParams({ from: "/advisors/$domain" });
  const nav = useNavigate();
  const m = meta[domain] ?? meta.grant;
  // Read language from localStorage (set in Settings)
  const language: Language = (localStorage.getItem("northstar_language") as Language) ?? "en";

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authStore.isLoggedIn()) { nav({ to: "/login" }); return; }
    let cancelled = false;
    async function initConversation() {
      setLoadingHistory(true);
      setMessages([]);
      setConversation(null);
      try {
        const convos = await chatApi.listConversations(domain as AdvisorDomain);
        let convo = convos[0] ?? null;
        if (!convo) convo = await chatApi.createConversation(domain as AdvisorDomain, language);
        if (cancelled) return;
        setConversation(convo);
        const history = await chatApi.getMessages(convo.id);
        if (!cancelled) setMessages(history);
      } catch {
        if (!cancelled) toast.error("Could not load advisor. Please check you are signed in.");
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    }
    initConversation();
    return () => { cancelled = true; };
  }, [domain]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msg.trim() || !conversation || sending) return;
    const userMsg: Message = { id: crypto.randomUUID(), conversation_id: conversation.id, role: "user", content: msg, sources_cited: [], created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setMsg("");
    setSending(true);
    try {
      const res = await chatApi.sendMessage(conversation.id, userMsg.content, language);
      setMessages((prev) => [...prev, res.message]);
    } catch {
      toast.error("Failed to send. Please try again.");
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
      setMsg(userMsg.content);
    } finally { setSending(false); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !conversation) return;
    setUploadingDoc(true);
    try {
      const res = await chatApi.uploadDocument(conversation.id, file, `Please analyze this contract: ${file.name}`, language);
      setMessages((prev) => [...prev, res.message]);
      toast.success(`${file.name} analyzed.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadingDoc(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <SiteShell variant="paper">
      <div className="mb-6 flex flex-wrap gap-2">
        {Object.entries(meta).map(([id, v]) => (
          <Link key={id} to="/advisors/$domain" params={{ domain: id }}
            className={`rounded-full border px-4 py-1.5 text-xs uppercase tracking-[0.2em] transition ${id === domain ? "border-primary bg-primary/15 text-primary" : "border-border/50 text-muted-foreground hover:border-primary/60"}`}
            style={{ fontFamily: "var(--font-mono-disp)" }}>
            {v.t.split(" ")[0]}
          </Link>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <GlassCard className="md:col-span-2 flex flex-col">
          <p className="text-xs uppercase tracking-[0.3em] text-primary" style={{ fontFamily: "var(--font-mono-disp)" }}>{domain}</p>
          <h1 className="mt-1 text-4xl">{m.t}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{m.sub}</p>

          {domain === "contract" && (
            <div className="mt-4">
              <input ref={fileInputRef} type="file" accept=".pdf,.txt,.md" onChange={handleFileUpload} className="hidden" id="contract-upload" />
              <label htmlFor="contract-upload"
                className={`flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border/60 px-4 py-3 text-sm text-muted-foreground transition hover:border-primary/60 hover:text-foreground ${uploadingDoc ? "opacity-50 pointer-events-none" : ""}`}>
                <span>📎</span>
                <span>{uploadingDoc ? "Analyzing document…" : "Upload contract PDF or text file"}</span>
              </label>
            </div>
          )}

          <div className="mt-6 flex-1 space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {loadingHistory ? (
              <p className="text-sm text-muted-foreground">Loading conversation…</p>
            ) : messages.length === 0 ? (
              <ChatBubble who="advisor">
                <p>How can I help today? I'll cite every authoritative source and keep softer reasoning clearly labeled.</p>
              </ChatBubble>
            ) : (
              messages.map((message) => (
                <ChatBubble key={message.id} who={message.role === "user" ? "you" : "advisor"}>
                  <MarkdownContent content={message.content} />
                  {message.role === "assistant" && message.sources_cited?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-border/30 pt-3">
                      {message.sources_cited.map((s, i) => (
                        s.url ? (
                          <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline underline-offset-2">
                            {s.publication ?? s.title}
                          </a>
                        ) : <span key={i} className="text-xs text-muted-foreground">{s.title}</span>
                      ))}
                    </div>
                  )}
                </ChatBubble>
              ))
            )}
            {sending && <ChatBubble who="advisor"><span className="text-muted-foreground">thinking…</span></ChatBubble>}
            <div ref={bottomRef} />
          </div>

          <form className="mt-6 flex gap-2" onSubmit={sendMessage}>
            <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={m.placeholder}
              disabled={sending || loadingHistory}
              className="flex-1 rounded-full border border-border/60 bg-input/60 px-5 py-3 outline-none focus:border-primary disabled:opacity-60" />
            <button type="submit" disabled={sending || !msg.trim() || loadingHistory}
              className="rounded-full bg-primary px-6 text-xs uppercase tracking-[0.2em] text-primary-foreground disabled:opacity-50"
              style={{ fontFamily: "var(--font-mono-disp)" }}>send</button>
          </form>
        </GlassCard>

        <div className="space-y-4">
          <GlassCard>
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground" style={{ fontFamily: "var(--font-mono-disp)" }}>authority sources</p>
            <ul className="mt-3 space-y-2 text-sm">
              {m.sources.map((s) => <li key={s} className="border-l-2 border-primary/60 pl-3">{s}</li>)}
            </ul>
          </GlassCard>
          <GlassCard>
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground" style={{ fontFamily: "var(--font-mono-disp)" }}>scope limits</p>
            <p className="mt-3 text-sm text-muted-foreground">No active IRS audits. No legal representation. Complex situations routed to SCORE, legal aid, or local SBDC.</p>
          </GlassCard>
          {conversation && (
            <GlassCard>
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground" style={{ fontFamily: "var(--font-mono-disp)" }}>session</p>
              <p className="mt-2 text-xs text-muted-foreground">{messages.length} message{messages.length !== 1 ? "s" : ""} · {language.toUpperCase()}</p>
              <p className="mt-1 text-xs text-muted-foreground">Change language in <a href="/settings" className="underline">Settings</a></p>
            </GlassCard>
          )}
        </div>
      </div>
    </SiteShell>
  );
}

function ChatBubble({ who, children }: { who: "advisor" | "you"; children: React.ReactNode }) {
  return (
    <div className={`flex ${who === "you" ? "justify-end" : ""}`}>
      <div className={`max-w-[85%] rounded-2xl px-5 py-3 text-sm ${who === "advisor" ? "bg-card/60 border border-border/40" : "bg-primary text-primary-foreground"}`}>
        {children}
      </div>
    </div>
  );
}

function MarkdownContent({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <div className="space-y-2 leading-relaxed">
      {lines.map((line, i) => {
        if (!line.trim()) return <br key={i} />;
        if (line.startsWith("### ")) return <h3 key={i} className="font-semibold mt-3">{line.slice(4)}</h3>;
        if (line.startsWith("## ")) return <h2 key={i} className="font-semibold text-base mt-3">{line.slice(3)}</h2>;
        if (line.startsWith("* ") || line.startsWith("- ")) return <p key={i} className="pl-3 border-l border-border/40">• {line.slice(2)}</p>;
        if (line.startsWith("[CALENDAR_EVENT")) return null;
        return <p key={i}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\[.+?\]\(.+?\))/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    const linkMatch = part.match(/\[(.+?)\]\((.+?)\)/);
    if (linkMatch) return <a key={i} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">{linkMatch[1]}</a>;
    return part;
  });
}