import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { listVerifications, decideVerification } from "@/lib/verification.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Review queue — MathGraph" },
      { name: "description", content: "Admin queue for reviewing MathGraph identity verifications." },
      { property: "og:title", content: "Review queue — MathGraph" },
      { property: "og:description", content: "Admin identity review queue." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

type Item = Awaited<ReturnType<typeof listVerifications>>[number];

function AdminPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function load() {
    const { data } = await supabase.auth.getUser();
    if (!data.user) { setError("Sign in as an admin to see the queue."); return; }
    try { setItems(await listVerifications()); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load the queue."); }
  }
  useEffect(() => { void load(); }, []);

  async function decide(userId: string, approve: boolean) {
    await decideVerification({ data: { userId, approve, note: notes[userId] || undefined } });
    await load();
  }

  return (
    <main className="mx-auto max-w-4xl space-y-4 bg-background p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Identity review queue</h1>
        <Link to="/" className="text-xs text-muted-foreground underline">Back to graph</Link>
      </div>
      {error && <p className="text-sm text-muted-foreground">{error}</p>}
      {items && items.length === 0 && <p className="text-sm text-muted-foreground">Nothing waiting for review.</p>}
      {items?.map((it) => (
        <section key={it.userId} className="space-y-3 rounded-lg border border-border p-4">
          <div className="text-sm text-foreground">
            <strong>{it.fullName || "(no name)"}</strong> · {it.email} · student ID {it.studentId}
          </div>
          <div className="text-xs text-muted-foreground">
            AI confidence: {it.confidence === null ? "n/a" : `${Math.round(it.confidence * 100)}%`} — {it.summary}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <a href={it.studentCardUrl} target="_blank" rel="noreferrer">
              <img src={it.studentCardUrl} alt="Student ID card" className="w-full rounded border border-border" />
            </a>
            <a href={it.idCardUrl} target="_blank" rel="noreferrer">
              <img src={it.idCardUrl} alt="Government ID" className="w-full rounded border border-border" />
            </a>
          </div>
          <input placeholder="Note to the user (optional)" value={notes[it.userId] ?? ""}
            onChange={(e) => setNotes({ ...notes, [it.userId]: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <button onClick={() => decide(it.userId, true)}
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground">Approve</button>
            <button onClick={() => decide(it.userId, false)}
              className="rounded-md border border-border px-3 py-1.5 text-sm">Reject</button>
          </div>
        </section>
      ))}
    </main>
  );
}
