import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
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

function HistoryPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ["history"],
    queryFn: async () => {
      const [log, profiles] = await Promise.all([
        supabase.from("change_log").select("*").order("created_at", { ascending: false }).limit(500),
        supabase.from("profiles").select("id, full_name"),
      ]);
      if (log.error) throw log.error;
      const names = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name]));
      const unknownActor = t("history.unknownActor");
      const editorsActor = t("history.editors");
      return (log.data ?? []).map((r) => {
        const actorName = r.actor_id ? names.get(r.actor_id) ?? unknownActor : editorsActor;
        return { ...r, who: actorName };
      });
    },
  });

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">{t("history.heading")}</h1>
        <Link to="/" className="text-sm underline">{t("common.backToGraph")}</Link>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">{t("history.description")}</p>
      {isLoading && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
      <ol className="divide-y divide-border rounded-md border border-border">
        {data?.map((r) => {
          const actionKey = `history.actions.${r.action}`;
          const actionText = t(actionKey, { defaultValue: r.action });
          const entityKey = `history.entities.${r.entity_type}`;
          const entityText = t(entityKey, { defaultValue: r.entity_type });
          return (
            <li
              key={r.id}
              className="flex items-baseline justify-between gap-4 px-4 py-2.5 text-sm"
            >
              <span>
                <strong>{r.who}</strong>{" "}
                {r.entity_type === "submission_votes" || r.entity_type === "submission_comments" ? (
                  r.entity_type === "submission_votes" ? (
                    r.summary
                  ) : (
                    `${t("history.commented")} ${r.summary}`
                  )
                ) : (
                  <>
                    {actionText} {entityText} <em>{r.summary}</em>
                  </>
                )}
              </span>
              <time className="shrink-0 text-xs text-muted-foreground">
                {new Date(r.created_at).toLocaleString()}
              </time>
            </li>
          );
        })}
        {data && !data.length && (
          <li className="px-4 py-3 text-sm text-muted-foreground">{t("history.noChanges")}</li>
        )}
      </ol>
    </main>
  );
}
