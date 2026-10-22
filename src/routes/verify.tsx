import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { submitVerification } from "@/lib/verification.functions";

export const Route = createFileRoute("/verify")({
  head: () => ({
    meta: [
      { title: "Verify your identity — MathGraph" },
      { name: "description", content: "Confirm your student identity to submit and review on MathGraph." },
      { property: "og:title", content: "Verify your identity — MathGraph" },
      { property: "og:description", content: "Student ID verification for MathGraph reviewers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VerifyPage,
});

type Status = { status: string; reviewer_note: string | null; ai_summary: string | null } | null;
const field = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

function VerifyPage() {
  const { t } = useTranslation();
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [current, setCurrent] = useState<Status>(null);
  const [studentId, setStudentId] = useState("");
  const [studentCard, setStudentCard] = useState<File | null>(null);
  const [idCard, setIdCard] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id ?? null;
    setUserId(uid);
    if (!uid) return;
    const { data: v } = await supabase.from("identity_verifications")
      .select("status, reviewer_note, ai_summary").eq("user_id", uid).maybeSingle();
    setCurrent(v);
  }
  useEffect(() => { void load(); }, []);

  async function upload(uid: string, file: File, label: string) {
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${uid}/${label}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("id-documents").upload(path, file, { contentType: file.type });
    if (error) throw new Error(error.message);
    return path;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !studentCard || !idCard) return;
    setBusy(true);
    setMsg(t("verify.uploadingMessage"));
    try {
      const studentCardPath = await upload(userId, studentCard, "student-card");
      const idCardPath = await upload(userId, idCard, "id-card");
      const res = await submitVerification({ data: { studentId, studentCardPath, idCardPath } });
      setMsg(res.message);
      await load();
    } catch (err) {
      const genericMsg = t("verify.genericError");
      setMsg(err instanceof Error ? err.message : genericMsg);
    }
    setBusy(false);
  }

  if (userId === undefined) {
    return <main className="p-6 text-sm text-muted-foreground">{t("common.loading")}</main>;
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <div className="w-full max-w-md space-y-4 rounded-lg border border-border p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-foreground">{t("verify.heading")}</h1>
        <p className="text-xs text-muted-foreground">{t("verify.description")}</p>
        {!userId ? (
          <Link
            to="/auth"
            className={
              "block rounded-md bg-primary px-3 py-2 text-center text-sm text-primary-foreground"
            }
          >
            {t("verify.signInToVerify")}
          </Link>
        ) : current?.status === "approved" ? (
          <p className="text-sm text-foreground">{t("verify.verifiedNotice")}</p>
        ) : current?.status === "needs_review" || current?.status === "checking" ? (
          <p className="text-sm text-foreground">{t("verify.waitingReviewNotice")}</p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            {current?.status === "rejected" && (
              <p className="text-xs text-destructive">
                {t("verify.previousRejected")}
                {current.reviewer_note ? `: ${current.reviewer_note}` : "."}{" "}
                {t("verify.canTryAgain")}
              </p>
            )}
            <input
              required
              minLength={2}
              placeholder={t("verify.studentIdPlaceholder")}
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className={field}
            />
            <label className="block text-xs text-muted-foreground">
              {t("verify.studentCardLabel")}
              <input
                required
                type="file"
                accept="image/*"
                className={field}
                onChange={(e) => setStudentCard(e.target.files?.[0] ?? null)}
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              {t("verify.idCardLabel")}
              <input
                required
                type="file"
                accept="image/*"
                className={field}
                onChange={(e) => setIdCard(e.target.files?.[0] ?? null)}
              />
            </label>
            <button
              disabled={busy}
              className={
                "w-full rounded-md bg-primary px-3 py-2 text-sm " +
                "text-primary-foreground disabled:opacity-50"
              }
            >
              {t("verify.submitButton")}
            </button>
          </form>
        )}
        {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
        <Link to="/" className="block text-xs text-muted-foreground underline">
          {t("common.backToGraph")}
        </Link>
      </div>
    </main>
  );
}
