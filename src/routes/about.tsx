import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About MathGraph — and how to contribute" },
      { name: "description", content: "MathGraph maps mathematics as a connected graph of axioms, definitions, theorems, lemmas and proofs. Learn how to contribute." },
      { property: "og:title", content: "About MathGraph" },
      { property: "og:description", content: "Why mathematics is a graph, not a list of facts — and how you can add to it." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-8 p-8 leading-relaxed">
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-semibold">About MathGraph</h1>
        <Link to="/" className="text-sm underline">Back to graph</Link>
      </div>
      <section className="space-y-3">
        <p>Mathematics is built step by step: axioms and definitions lead to lemmas, lemmas to theorems, and every theorem rests on a proof. Yet theorems are usually taught as isolated facts.</p>
        <p>MathGraph shows the structure instead. Every box is an axiom, definition, theorem, lemma, proof or conjecture, and every line shows what depends on what. Click a box to see its statement, its source and how it connects to the rest.</p>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Anyone can explore</h2>
        <p>You don't need an account to read the graph, the open submissions, their discussions or the full change history.</p>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">How to contribute</h2>
        <ol className="list-decimal space-y-2 pl-5">
          <li><Link to="/auth" className="underline">Create an account</Link> with your real name and a university email, then confirm the email.</li>
          <li>Open <strong>Submissions</strong> in the top-right corner of the graph and choose <strong>Make submission</strong>.</li>
          <li>Pick the type, write the statement (use <code>$...$</code> for formulas), add a source, and link it to the boxes it uses, proves or belongs to.</li>
          <li>Other reviewers approve, reject, comment and suggest edits. You can accept a suggested edit at any time.</li>
          <li>After three approvals the submission joins the graph.</li>
        </ol>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Accountability</h2>
        <p>Everyone's real name is shown next to their submissions, votes and comments, and every change is recorded in the public <Link to="/history" className="underline">change history</Link>.</p>
      </section>
    </main>
  );
}
