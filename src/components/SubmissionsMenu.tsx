import { Fragment, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type Kind = "axiom" | "definition" | "conjecture" | "theorem" | "proof";
type GraphItem = { id: string; name: string; kind: Kind };
type Relation = "uses" | "proof_of";

const KINDS: Kind[] = ["axiom", "definition", "theorem", "proof", "conjecture"];
const NEEDED = 3;

async function fetchReview() {
  const [subs, links, votes, comments, profiles] = await Promise.all([
    supabase.from("submissions").select("*").order("created_at", { ascending: false }),
    supabase.from("submission_links").select("*"),
    supabase.from("submission_votes").select("*"),
    supabase.from("submission_comments").select("*").order("created_at"),
    supabase.from("profiles").select("id, full_name"),
  ]);
  for (const r of [subs, links, votes, comments, profiles]) if (r.error) throw r.error;
  const names = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name]));
  return {
    subs: subs.data ?? [],
    links: links.data ?? [],
    votes: votes.data ?? [],
    comments: comments.data ?? [],
    names,
  };
}
type Review = Awaited<ReturnType<typeof fetchReview>>;
type Sub = Review["subs"][number];

export function SubmissionsMenu(props: {
  userId: string | null;
  items: GraphItem[];
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const { userId, items, open, setOpen } = props;
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<null | { mode: "new" } | { mode: "view"; id: string }>(null);
  const { data } = useQuery({ queryKey: ["review"], queryFn: fetchReview });
  const { data: academic } = useQuery({
    queryKey: ["academic", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.rpc("is_academic", { _uid: userId! });
      return !!data;
    },
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["review"] });
    void qc.invalidateQueries({ queryKey: ["graph"] });
  };
  const pending = (data?.subs ?? []).filter((s) => s.status === "pending");
  const mine = (data?.subs ?? []).filter((s) => s.author_id === userId);
  const others = pending.filter((s) => s.author_id !== userId);
  const approvals = (id: string) => {
    const list = (data?.votes ?? []).filter((v) => v.submission_id === id && v.approve);
    return list.length;
  };

  const Row = ({ s }: { s: Sub }) => (
    <button
      onClick={() => {
        setOpen(false);
        setDialog({ mode: "view", id: s.id });
      }}
      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted"
    >
      <span className="truncate">{s.name}</span>
      <span className="shrink-0 text-muted-foreground">
        {s.status === "pending" ? `${approvals(s.id)}/${NEEDED}` : s.status}
      </span>
    </button>
  );

  return (
    <div className="relative flex flex-1">
      <button
        onClick={() => setOpen(!open)}
        className="relative z-30 flex flex-1 items-center justify-center gap-1 whitespace-nowrap px-3 py-2 text-center text-xs font-medium text-foreground transition-colors hover:bg-muted"
      >
        <span>
          {t("submissions.submissionsLabel")}
          {others.length ? ` (${others.length})` : ""}
        </span>
        <svg
          className={
            `h-3 w-3 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`
          }
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-full min-w-56 overflow-hidden rounded-md border border-border bg-background shadow-md">
          <div className="border-b border-border py-1">
            {academic ? (
              <button
                onClick={() => {
                  setOpen(false);
                  setDialog({ mode: "new" });
                }}
                className="w-full px-3 py-1.5 text-left text-xs hover:bg-muted"
              >
                {t("submissions.makeSubmission")}
              </button>
            ) : (
              <p className="px-3 py-1.5 text-[11px] leading-snug text-muted-foreground">
                {userId ? (
                  t("submissions.universityEmailRequired")
                ) : (
                  <>
                    <Link to="/auth" className="underline">
                      {t("submissions.signInLink")}
                    </Link>{" "}
                    {t("submissions.signInPrompt")}
                  </>
                )}
              </p>
            )}
          </div>
          {userId && (
            <>
              <p
                className={
                  "px-3 pb-1 pt-2 text-[9px] font-semibold uppercase " +
                  "tracking-widest text-muted-foreground"
                }
              >
                {t("submissions.mySubmissions")}
              </p>
              <div className="max-h-36 overflow-y-auto pb-1">
                {mine.map((s) => (
                  <Row key={s.id} s={s} />
                ))}
                {!mine.length && (
                  <p className="px-3 py-1 text-xs text-muted-foreground">
                    {t("submissions.noneYet")}
                  </p>
                )}
              </div>
            </>
          )}
          <p
            className={
              "border-t border-border px-3 pb-1 pt-2 text-[9px] font-semibold " +
              "uppercase tracking-widest text-muted-foreground"
            }
          >
            {t("submissions.pendingReview")}
          </p>
          <div className="max-h-48 overflow-y-auto pb-1">
            {others.map((s) => (
              <Row key={s.id} s={s} />
            ))}
            {!others.length && (
              <p className="px-3 py-1 text-xs text-muted-foreground">
                {t("submissions.nothingToReview")}
              </p>
            )}
          </div>
        </div>
      )}
      <Dialog open={!!dialog} onOpenChange={(v) => !v && setDialog(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {dialog?.mode === "new" && userId && (
            <NewSubmission
              userId={userId}
              items={items}
              onDone={(id) => {
                refresh();
                setDialog({ mode: "view", id });
              }}
            />
          )}
          {dialog?.mode === "view" && data && (
            <SubmissionView
              id={dialog.id}
              data={data}
              items={items}
              userId={userId}
              academic={!!academic}
              onChange={refresh}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const field = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

function NewSubmission({
  userId,
  items,
  onDone,
}: {
  userId: string;
  items: GraphItem[];
  onDone: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [f, setF] = useState({
    kind: "theorem" as Kind,
    name: "",
    creator: "",
    date: "",
    statement: "",
    citation: "",
  });
  const [links, setLinks] = useState<{ relation: Relation; id: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const relations: Relation[] =
    f.kind === "theorem" ? ["uses"] : f.kind === "proof" ? ["proof_of"] : [];
  const relLabel: Record<Relation, string> = {
    uses: t("submissions.uses"),
    proof_of: t("submissions.proofOf"),
  };
  const targets = (r: Relation) =>
    items.filter((i) => (r === "uses" ? i.kind !== "proof" : i.kind === "theorem"));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (f.kind === "proof" && !links.length) {
      setErr(t("submissions.pickTheoremError"));
      return;
    }
    setBusy(true);
    const trimmedName = f.name.trim();
    const trimmedStatement = f.statement.trim();
    const { data, error } = await supabase
      .from("submissions")
      .insert({
        author_id: userId,
        kind: f.kind,
        name: trimmedName,
        statement: trimmedStatement,
        creator: f.creator || null,
        date: f.date || null,
        citation: f.citation || null,
      })
      .select("id")
      .single();
    if (error || !data) {
      setBusy(false);
      const submitErrMsg = error?.message ?? t("submissions.submitError");
      setErr(submitErrMsg);
      return;
    }
    const valid = links.filter((l) => relations.includes(l.relation));
    if (valid.length) {
      const mappedLinks = valid.map((l) => {
        const targetObj = items.find((i) => i.id === l.id);
        return {
          submission_id: data.id,
          relation: l.relation,
          target_id: l.id,
          target_type: targetObj!.kind,
        };
      });
      const { error: le } = await supabase.from("submission_links").insert(mappedLinks);
      if (le) {
        setBusy(false);
        setErr(le.message);
        return;
      }
    }
    setBusy(false);
    onDone(data.id);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <DialogHeader>
        <DialogTitle>{t("submissions.makeSubmissionTitle")}</DialogTitle>
        <DialogDescription>
          {t("submissions.makeSubmissionDescription", { count: NEEDED })}
        </DialogDescription>
      </DialogHeader>
      <select
        value={f.kind}
        onChange={(e) => {
          setF({ ...f, kind: e.target.value as Kind });
          setLinks([]);
        }}
        className={`${field} capitalize`}
      >
        {KINDS.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
      <input
        required
        placeholder={t("common.name")}
        value={f.name}
        onChange={(e) => setF({ ...f, name: e.target.value })}
        className={field}
      />
      <textarea
        required
        rows={4}
        placeholder={t("submissions.statementPlaceholder")}
        value={f.statement}
        onChange={(e) => setF({ ...f, statement: e.target.value })}
        className={field}
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          placeholder={t("submissions.creatorPlaceholder")}
          value={f.creator}
          onChange={(e) => setF({ ...f, creator: e.target.value })}
          className={field}
        />
        <input
          placeholder={t("submissions.datePlaceholder")}
          value={f.date}
          onChange={(e) => setF({ ...f, date: e.target.value })}
          className={field}
        />
      </div>
      <input
        placeholder={t("submissions.citationPlaceholder")}
        value={f.citation}
        onChange={(e) => setF({ ...f, citation: e.target.value })}
        className={field}
      />
      {relations.map((r) => (
        <div key={r} className="space-y-1.5">
          <p className="text-xs font-medium">{relLabel[r]}</p>
          <div className="flex flex-wrap gap-1">
            {links
              .filter((l) => l.relation === r)
              .map((l) => (
                <button
                  type="button"
                  key={l.id}
                  onClick={() => setLinks(links.filter((x) => x !== l))}
                  className="rounded border border-border px-2 py-0.5 text-xs hover:bg-muted"
                >
                  {items.find((i) => i.id === l.id)?.name} ×
                </button>
              ))}
          </div>
          {(r === "uses" || !links.some((l) => l.relation === r)) && (
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  setLinks([...links, { relation: r, id: e.target.value }]);
                }
              }}
              className={field}
            >
              <option value="">{t("submissions.addOption")}</option>
              {targets(r)
                .filter((tItem) => !links.some((l) => l.id === tItem.id))
                .map((tItem) => (
                  <option key={tItem.id} value={tItem.id}>
                    {tItem.name} ({tItem.kind})
                  </option>
                ))}
            </select>
          )}
        </div>
      ))}
      {err && <p className="text-xs text-destructive">{err}</p>}
      <button
        disabled={busy}
        className={
          "w-full rounded-md bg-primary px-3 py-2 text-sm " +
          "text-primary-foreground disabled:opacity-50"
        }
      >
        {t("submissions.submitForReview")}
      </button>
    </form>
  );
}

function SubmissionView(props: {
  id: string;
  data: Review;
  items: GraphItem[];
  userId: string | null;
  academic: boolean;
  onChange: () => void;
}) {
  const { id, data, items, userId, academic, onChange } = props;
  const { t } = useTranslation();
  const s = data.subs.find((x) => x.id === id);
  const [body, setBody] = useState("");
  const [suggest, setSuggest] = useState("");
  const [showSuggest, setShowSuggest] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!s) return <p className="text-sm">{t("submissions.submissionNotFound")}</p>;
  const name = (uid: string | null) => (uid && data.names.get(uid)) || t("common.unknown");
  const votes = data.votes.filter((v) => v.submission_id === id);
  const myVote = votes.find((v) => v.voter_id === userId);
  const links = data.links.filter((l) => l.submission_id === id);
  const comments = data.comments.filter((c) => c.submission_id === id);
  const isAuthor = s.author_id === userId;
  const canReview = academic && !isAuthor && s.status === "pending";

  async function vote(approve: boolean) {
    setMsg(null);
    const { error } = myVote
      ? await supabase
          .from("submission_votes")
          .update({ approve })
          .eq("submission_id", id)
          .eq("voter_id", userId!)
      : await supabase
          .from("submission_votes")
          .insert({ submission_id: id, voter_id: userId!, approve });
    if (error) {
      setMsg(error.message);
      return;
    }
    const { data: res } = await supabase.rpc("publish_if_approved", { _sid: id });
    if (res === "published") {
      setMsg(t("submissions.approvedBanner"));
    }
    onChange();
  }

  async function comment(e: React.FormEvent) {
    e.preventDefault();
    const trimmedBody = body.trim();
    const trimmedSuggest = suggest.trim();
    const suggestedStatement = showSuggest && trimmedSuggest ? trimmedSuggest : null;
    const { error } = await supabase.from("submission_comments").insert({
      submission_id: id,
      author_id: userId!,
      body: trimmedBody,
      suggested_statement: suggestedStatement,
    });
    if (error) {
      setMsg(error.message);
      return;
    }
    setBody("");
    setSuggest("");
    setShowSuggest(false);
    onChange();
  }

  async function applySuggestion(text: string) {
    const { error } = await supabase.from("submissions").update({ statement: text }).eq("id", id);
    if (error) {
      setMsg(error.message);
      return;
    }
    onChange();
  }

  async function withdraw() {
    const { error } = await supabase.from("submissions").update({ status: "withdrawn" }).eq("id", id);
    if (error) {
      setMsg(error.message);
      return;
    }
    onChange();
  }

  return (
    <div className="space-y-4 text-sm">
      <DialogHeader>
        <DialogTitle>{s.name}</DialogTitle>
        <DialogDescription>
          <span className="capitalize">{s.kind}</span> {t("submissions.submittedBy")}{" "}
          <strong className="text-foreground">{name(s.author_id)}</strong> ·{" "}
          {s.status === "pending"
            ? t("submissions.approvalsCount", {
                count: votes.filter((v) => v.approve).length,
                needed: NEEDED,
              })
            : s.status}
        </DialogDescription>
      </DialogHeader>
      <p className="whitespace-pre-wrap rounded-md bg-muted p-3">{s.statement}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {s.creator && (
          <>
            <dt className="text-muted-foreground">{t("common.creator")}</dt>
            <dd>{s.creator}</dd>
          </>
        )}
        {s.date && (
          <>
            <dt className="text-muted-foreground">{t("common.date")}</dt>
            <dd>{s.date}</dd>
          </>
        )}
        {s.citation && (
          <>
            <dt className="text-muted-foreground">{t("common.citation")}</dt>
            <dd>{s.citation}</dd>
          </>
        )}
        {links.map((l) => (
          <Fragment key={l.id}>
            <dt className="text-muted-foreground">
              {l.relation === "uses" ? t("submissions.uses") : t("submissions.proofOf")}
            </dt>
            <dd>{items.find((i) => i.id === l.target_id)?.name ?? "?"}</dd>
          </Fragment>
        ))}
      </dl>
      {votes.length > 0 && (
        <div className="text-xs">
          <p className="mb-1 font-medium">{t("submissions.votesHeading")}</p>
          {votes.map((v) => (
            <p key={v.voter_id}>
              {v.approve ? "✓" : "✗"} {name(v.voter_id)}
            </p>
          ))}
        </div>
      )}
      {canReview && (
        <div className="flex gap-2">
          <button
            onClick={() => vote(true)}
            className={`flex-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted ${
              myVote?.approve === true ? "bg-muted font-semibold" : ""
            }`}
          >
            {t("submissions.approve")}
          </button>
          <button
            onClick={() => vote(false)}
            className={`flex-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted ${
              myVote?.approve === false ? "bg-muted font-semibold" : ""
            }`}
          >
            {t("submissions.reject")}
          </button>
        </div>
      )}
      {isAuthor && s.status === "pending" && (
        <button onClick={withdraw} className="text-xs text-destructive underline">
          {t("submissions.withdrawSubmission")}
        </button>
      )}
      <div className="space-y-2">
        <p className="text-xs font-medium">{t("submissions.discussionHeading")}</p>
        {comments.map((c) => (
          <div key={c.id} className="rounded-md border border-border p-2 text-xs">
            <p className="mb-1 text-muted-foreground">
              <strong className="text-foreground">{name(c.author_id)}</strong> ·{" "}
              {new Date(c.created_at).toLocaleString()}
            </p>
            <p className="whitespace-pre-wrap">{c.body}</p>
            {c.suggested_statement && (
              <div className="mt-2 rounded bg-muted p-2">
                <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {t("submissions.suggestedStatement")}
                </p>
                <p className="whitespace-pre-wrap">{c.suggested_statement}</p>
                {isAuthor && s.status === "pending" && c.suggested_statement !== s.statement && (
                  <button
                    onClick={() => applySuggestion(c.suggested_statement!)}
                    className="mt-1 underline"
                  >
                    {t("submissions.acceptThisEdit")}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        {!comments.length && (
          <p className="text-xs text-muted-foreground">{t("submissions.noComments")}</p>
        )}
        {academic && s.status === "pending" && (
          <form onSubmit={comment} className="space-y-2">
            <textarea
              required
              rows={2}
              placeholder={t("submissions.commentPlaceholder")}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className={field}
            />
            {showSuggest ? (
              <textarea
                rows={3}
                placeholder={t("submissions.suggestedStatement")}
                value={suggest}
                onChange={(e) => setSuggest(e.target.value)}
                className={field}
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setShowSuggest(true);
                  setSuggest(s.statement);
                }}
                className="text-xs underline"
              >
                {t("submissions.suggestEditButton")}
              </button>
            )}
            <button
              className={
                "w-full rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
              }
            >
              {t("submissions.postComment")}
            </button>
          </form>
        )}
      </div>
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}
