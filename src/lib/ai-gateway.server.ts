// Server-only: streams a Lovable AI Gateway Responses call and returns the final text.
const RUN_ID_HEADER = "X-Lovable-AIG-Run-ID";

export class GatewayError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function streamResponseText(model: string, input: unknown[]): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new GatewayError(401, "AI is not configured.");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model,
      input,
      stream: true,
      store: false,
      reasoning: { effort: "low", summary: "auto" },
      include: ["reasoning.encrypted_content"],
    }),
  });
  void res.headers.get(RUN_ID_HEADER);
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    let message = `AI request failed (${res.status})`;
    try {
      message = JSON.parse(body)?.error?.message ?? JSON.parse(body)?.message ?? message;
    } catch {
      /* keep default */
    }
    throw new GatewayError(res.status, message);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const evt = JSON.parse(payload);
        if (evt.type === "response.output_text.delta") text += evt.delta ?? "";
        if (evt.type === "error" || evt.type === "response.failed")
          throw new GatewayError(500, evt.error?.message ?? evt.response?.error?.message ?? "AI request failed");
      } catch (e) {
        if (e instanceof GatewayError) throw e;
      }
    }
  }
  return text;
}
