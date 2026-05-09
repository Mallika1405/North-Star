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
  const getLanguage = (): Language => (localStorage.getItem("northstar_language") as Language) ?? "en";

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
        if (!convo) convo = await chatApi.createConversation(domain as AdvisorDomain, getLanguage());
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
      const res = await chatApi.sendMessage(conversation.id, userMsg.content, getLanguage());
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
      const prompt = domain === "tax"
        ? `Please analyze this tax document: ${file.name}`
        : `Please analyze this contract: ${file.name}`;
      const res = await chatApi.uploadDocument(conversation.id, file, prompt, getLanguage());
      setMessages((prev) => [...prev, res.message]);
      toast.success(`${file.name} analyzed.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadingDoc(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const showUpload = domain === "contract" || domain === "tax";

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

          {/* Universal privacy notice */}
          <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            Do not share Social Security numbers, bank account numbers, IRS case/notice IDs, or any information you would not share with a third party. Your messages are processed by an AI model.
          </div>

          {/* Upload section — contract and tax */}
          {showUpload && (
            <div className="mt-3 space-y-3">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <p className="font-medium">Before uploading, please remove or black out:</p>
                <ul className="mt-1 space-y-0.5 text-xs">
                  <li>• Social Security numbers (yours or anyone else's)</li>
                  <li>• Bank account or routing numbers</li>
                  <li>• IRS case numbers, notice IDs, or audit reference numbers</li>
                  <li>• Any information you would not share with a third party</li>
                </ul>
                <p className="mt-2 text-xs text-amber-700">Your document is sent to an AI model for analysis. Do not upload documents containing active legal disputes or confidential personal financial data.</p>
              </div>
              <input ref={fileInputRef} type="file" accept=".pdf,.txt,.md" onChange={handleFileUpload} className="hidden" id="doc-upload" />
              <label htmlFor="doc-upload"
                className={`flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border/60 px-4 py-3 text-sm text-muted-foreground transition hover:border-primary/60 hover:text-foreground ${uploadingDoc ? "opacity-50 pointer-events-none" : ""}`}>
                <span>{uploadingDoc ? "Analyzing document…" : domain === "tax" ? "Upload tax document, IRS notice, or W-2 / 1099" : "Upload contract PDF or text file"}</span>
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
              <p className="mt-2 text-xs text-muted-foreground">{messages.length} message{messages.length !== 1 ? "s" : ""} · {getLanguage().toUpperCase()}</p>
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
  const els: React.ReactNode[] = [];
  lines.forEach((line, i) => {
    if (!line.trim() || line.startsWith("[CALENDAR_EVENT")) return;
    if (line.startsWith("### ")) { els.push(<p key={i} className="font-semibold text-sm mt-2">{renderInline(line.slice(4))}</p>); return; }
    if (line.startsWith("## ") || line.startsWith("# ")) { els.push(<p key={i} className="font-bold text-base mt-2">{renderInline(line.replace(/^#{1,2} /, ""))}</p>); return; }
    if (line.startsWith("* ") || line.startsWith("- ")) { els.push(<p key={i} className="pl-3">• {renderInline(line.slice(2))}</p>); return; }
    els.push(<p key={i}>{renderInline(line)}</p>);
  });
  return <div className="space-y-1.5 leading-relaxed text-sm">{els}</div>;
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