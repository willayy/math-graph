import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Change history — MathGraph" },
      { name: "description", content: "Every change to MathGraph, with the real name of who made it." },
      { property: "og:title", content: "Change history — MathGraph" },
      { property: "og:description", content: "A public, accountable log of every change to the MathGraph." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistoryPage,
});

const TABLE_LABEL: Record<string, string> = {
  axioms: "axiom", definitions: "definition", theorems: "theorem", proofs: "proof",
  conjectures: "conjecture", sets: "set", submissions: "submission", submission_votes: "vote", submission_comments: "comment",
};
const ACTION_LABEL: Record<string, string> = {
  insert: "added", update: "edited", delete: "removed", published: "published", withdrawn: "withdrew",
};

function HistoryPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["history"],
    queryFn: async () => {
      const [log, profiles] = await Promise.all([
        supabase.from("change_log").select("*").order("created_at", { ascending: false }).limit(500),
        supabase.from("profiles").select("id, full_name"),
      ]);
      if (log.error) throw log.error;
      const names = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name]));
      return (log.data ?? []).map((r) => ({ ...r, who: r.actor_id ? names.get(r.actor_id) ?? "Unknown" : "MathGraph editors" }));
    },
  });
  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Change history</h1>
        <Link to="/" className="text-sm underline">Back to graph</Link>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">Every change to the graph and to submissions, newest first, with who made it.</p>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      <ol className="divide-y divide-border rounded-md border border-border">
        {data?.map((r) => (
          <li key={r.id} className="flex items-baseline justify-between gap-4 px-4 py-2.5 text-sm">
            <span>
              <strong>{r.who}</strong>{" "}
              {r.entity_type === "submission_votes" || r.entity_type === "submission_comments"
                ? r.entity_type === "submission_votes" ? r.summary : `commented ${r.summary}`
                : <>{ACTION_LABEL[r.action] ?? r.action} {TABLE_LABEL[r.entity_type] ?? r.entity_type} <em>{r.summary}</em></>}
            </span>
            <time className="shrink-0 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</time>
          </li>
        ))}
        {data && !data.length && <li className="px-4 py-3 text-sm text-muted-foreground">No changes recorded yet.</li>}
      </ol>
    </main>
  );
}
