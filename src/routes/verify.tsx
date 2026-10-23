import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
    setMsg("Uploading and checking your documents…");
    try {
      const studentCardPath = await upload(userId, studentCard, "student-card");
      const idCardPath = await upload(userId, idCard, "id-card");
      const res = await submitVerification({ data: { studentId, studentCardPath, idCardPath } });
      setMsg(res.message);
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Something went wrong.");
    }
    setBusy(false);
  }

  if (userId === undefined) return <main className="p-6 text-sm text-muted-foreground">Loading…</main>;

  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <div className="w-full max-w-md space-y-4 rounded-lg border border-border p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-foreground">Verify your identity</h1>
        <p className="text-xs text-muted-foreground">
          To submit and review you need a confirmed university email, your student ID number,
          a photo of your student card and a photo of a government ID. The name must match on all of them.
        </p>
        {!userId ? (
          <Link to="/auth" className="block rounded-md bg-primary px-3 py-2 text-center text-sm text-primary-foreground">
            Sign in to verify
          </Link>
        ) : current?.status === "approved" ? (
          <p className="text-sm text-foreground">You're verified — you can submit and review.</p>
        ) : current?.status === "needs_review" || current?.status === "checking" ? (
          <p className="text-sm text-foreground">Your documents are waiting for an admin to review them.</p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            {current?.status === "rejected" && (
              <p className="text-xs text-destructive">
                Previous attempt rejected{current.reviewer_note ? `: ${current.reviewer_note}` : "."} You can try again.
              </p>
            )}
            <input required minLength={2} placeholder="Student ID number" value={studentId}
              onChange={(e) => setStudentId(e.target.value)} className={field} />
            <label className="block text-xs text-muted-foreground">Photo of student ID card
              <input required type="file" accept="image/*" className={field}
                onChange={(e) => setStudentCard(e.target.files?.[0] ?? null)} />
            </label>
            <label className="block text-xs text-muted-foreground">Photo of driver's license, passport or national ID
              <input required type="file" accept="image/*" className={field}
                onChange={(e) => setIdCard(e.target.files?.[0] ?? null)} />
            </label>
            <button disabled={busy} className="w-full rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">
              Submit for verification
            </button>
          </form>
        )}
        {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
        <Link to="/" className="block text-xs text-muted-foreground underline">Back to graph</Link>
      </div>
    </main>
  );
}
