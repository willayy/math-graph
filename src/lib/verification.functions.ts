import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Confidence at or above this (with every check passing) approves automatically.
const AUTO_APPROVE_CONFIDENCE = 0.75;

const Input = z.object({
  studentId: z.string().trim().min(2).max(64),
  studentCardPath: z.string().min(3).max(300),
  idCardPath: z.string().min(3).max(300),
});

const Result = z.object({
  student_card_name: z.string().nullable(),
  id_card_name: z.string().nullable(),
  student_id_on_card: z.string().nullable(),
  names_match: z.boolean(),
  email_matches_name: z.boolean(),
  student_id_matches: z.boolean(),
  documents_look_genuine: z.boolean(),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
});

export const submitVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    for (const p of [data.studentCardPath, data.idCardPath])
      if (!p.startsWith(`${userId}/`)) throw new Error("Invalid upload.");

    const { data: academic } = await supabase.rpc("has_academic_email", { _uid: userId });
    if (!academic) return { status: "rejected" as const, message: "A confirmed university email is required." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("identity_verifications").select("status").eq("user_id", userId).maybeSingle();
    if (existing?.status === "approved") return { status: "approved" as const, message: "Already verified." };

    const [{ data: userRes }, { data: profile }] = await Promise.all([
      supabaseAdmin.auth.admin.getUserById(userId),
      supabaseAdmin.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    ]);
    const email = userRes.user?.email ?? "";
    const fullName = profile?.full_name ?? (userRes.user?.user_metadata?.["full_name"] as string | undefined) ?? "";

    await supabaseAdmin.from("identity_verifications").upsert({
      user_id: userId,
      student_id: data.studentId,
      student_card_path: data.studentCardPath,
      id_card_path: data.idCardPath,
      status: "checking",
      ai_confidence: null, ai_summary: null, ai_details: null,
      reviewer_id: null, reviewer_note: null, reviewed_at: null,
      updated_at: new Date().toISOString(),
    });

    const toDataUrl = async (path: string) => {
      const { data: file, error } = await supabaseAdmin.storage.from("id-documents").download(path);
      if (error || !file) throw new Error("Could not read an uploaded photo.");
      const buf = Buffer.from(await file.arrayBuffer());
      return `data:${file.type || "image/jpeg"};base64,${buf.toString("base64")}`;
    };

    let status: "approved" | "needs_review" = "needs_review";
    let summary = "Sent to manual review.";
    let confidence: number | null = null;
    let details: unknown = null;
    try {
      const [studentCard, idCard] = await Promise.all([toDataUrl(data.studentCardPath), toDataUrl(data.idCardPath)]);
      const { streamResponseText } = await import("./ai-gateway.server");
      const prompt = `You verify identities for an academic review site.
Account name: "${fullName}"
Account email: "${email}"
Student ID typed by the user: "${data.studentId}"
Image 1 is the student ID card, image 2 is a government ID (driver's license, passport, national ID).
Check: the names on both cards and the account name refer to the same person (allow middle names, diacritics, order); the email local part plausibly matches that name (e.g. initials/surname); the student ID number on the card matches the typed one; the documents look like genuine, unedited photos.
Reply with ONLY a JSON object: {"student_card_name": string|null, "id_card_name": string|null, "student_id_on_card": string|null, "names_match": boolean, "email_matches_name": boolean, "student_id_matches": boolean, "documents_look_genuine": boolean, "confidence": number 0-1 (your overall confidence everything matches), "summary": short sentence}`;
      const text = await streamResponseText("openai/gpt-6-astra", [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: studentCard },
            { type: "input_image", image_url: idCard },
          ],
        },
      ]);
      const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
      const r = Result.parse(JSON.parse(json));
      details = r;
      confidence = r.confidence;
      summary = r.summary;
      const allOk = r.names_match && r.email_matches_name && r.student_id_matches && r.documents_look_genuine;
      if (allOk && r.confidence >= AUTO_APPROVE_CONFIDENCE) status = "approved";
    } catch (e) {
      console.error("verification AI check failed", e);
      summary = "Automatic check unavailable; sent to manual review.";
    }

    await supabaseAdmin.from("identity_verifications").update({
      status, ai_confidence: confidence, ai_summary: summary, ai_details: details as never,
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId);

    return {
      status,
      message: status === "approved" ? "You're verified — you can now submit and review." : "An admin will review your documents shortly.",
    };
  });

async function assertAdmin(supabase: { rpc: (...a: never[]) => unknown }, userId: string) {
  const rpc = supabase.rpc as unknown as (
    fn: string, args: Record<string, unknown>,
  ) => Promise<{ data: boolean | null }>;
  const { data } = await rpc.call(supabase, "has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Admins only.");
}

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    return { admin: !!data };
  });

export const listVerifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("identity_verifications").select("*")
      .in("status", ["needs_review", "checking"]).order("created_at");
    if (error) throw new Error(error.message);
    return Promise.all((rows ?? []).map(async (r) => {
      const [{ data: u }, { data: p }, s1, s2] = await Promise.all([
        supabaseAdmin.auth.admin.getUserById(r.user_id),
        supabaseAdmin.from("profiles").select("full_name").eq("id", r.user_id).maybeSingle(),
        supabaseAdmin.storage.from("id-documents").createSignedUrl(r.student_card_path, 600),
        supabaseAdmin.storage.from("id-documents").createSignedUrl(r.id_card_path, 600),
      ]);
      return {
        userId: r.user_id, status: r.status, studentId: r.student_id,
        email: u.user?.email ?? "", fullName: p?.full_name ?? "",
        confidence: r.ai_confidence === null ? null : Number(r.ai_confidence),
        summary: r.ai_summary ?? "", createdAt: r.created_at,
        studentCardUrl: s1.data?.signedUrl ?? "", idCardUrl: s2.data?.signedUrl ?? "",
      };
    }));
  });

const Decision = z.object({
  userId: z.string().uuid(),
  approve: z.boolean(),
  note: z.string().max(500).optional(),
});

export const decideVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Decision.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { error } = await context.supabase.from("identity_verifications").update({
      status: data.approve ? "approved" : "rejected",
      reviewer_id: context.userId,
      reviewer_note: data.note ?? null,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
