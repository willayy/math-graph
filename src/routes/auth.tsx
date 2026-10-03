import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — MathGraph" },
      { name: "description", content: "Sign in to MathGraph to keep your graph layout and settings." },
      { property: "og:title", content: "Sign in — MathGraph" },
      { property: "og:description", content: "Sign in to keep your MathGraph layout across devices." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg(error.message);
      else navigate({ to: "/" });
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) setMsg(error.message);
      else if (data.session) navigate({ to: "/" });
      else setMsg("Check your email to confirm your account, then sign in.");
    }
    setBusy(false);
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-3 rounded-lg border border-border p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-foreground">
          {mode === "in" ? "Sign in to MathGraph" : "Create an account"}
        </h1>
        <input
          type="email" required placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <input
          type="password" required minLength={6} placeholder="Password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
        <button disabled={busy} className="w-full rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">
          {mode === "in" ? "Sign in" : "Sign up"}
        </button>
        <div className="flex justify-between text-xs text-muted-foreground">
          <button type="button" onClick={() => setMode(mode === "in" ? "up" : "in")} className="underline">
            {mode === "in" ? "Create an account" : "I have an account"}
          </button>
          <Link to="/" className="underline">Back to graph</Link>
        </div>
      </form>
    </main>
  );
}
