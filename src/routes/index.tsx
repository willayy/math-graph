import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MathGraph — the dependency graph of mathematics" },
      {
        name: "description",
        content:
          "MathGraph maps mathematics as it actually is: axioms, definitions, theorems, lemmas and proofs connected by what they use and what they lead to.",
      },
      { property: "og:title", content: "MathGraph — the dependency graph of mathematics" },
      {
        property: "og:description",
        content:
          "Axioms, definitions, theorems, lemmas and proofs — connected by what they use and what they lead to.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type Row = {
  id: string;
  date: string | null;
  name: string;
  creator: string | null;
  statement?: string;
  description?: string;
};

function useTable<T>(table: string) {
  return useQuery({
    queryKey: [table],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as T[];
    },
  });
}

function Meta({ row }: { row: Row }) {
  const parts = [row.date ?? "Date unknown", row.creator ?? "Creator unknown"];
  return (
    <p className="text-xs text-muted-foreground">{parts.join(" · ")}</p>
  );
}

function Section({
  title,
  rows,
  bodyKey,
}: {
  title: string;
  rows: Row[] | undefined;
  bodyKey: "statement" | "description";
}) {
  return (
    <section>
      <h2 className="border-b border-border pb-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
        <span className="ml-2 font-normal">{rows?.length ?? 0}</span>
      </h2>
      <ul className="divide-y divide-border">
        {rows?.map((row) => (
          <li key={row.id} className="py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-medium text-foreground">{row.name}</h3>
              <Meta row={row} />
            </div>
            <p className="mt-1 text-sm leading-relaxed text-foreground/80">
              {row[bodyKey]}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Index() {
  const sets = useTable<Row>("sets");
  const axioms = useTable<Row>("axioms");
  const definitions = useTable<Row>("definitions");
  const theorems = useTable<Row>("theorems");
  const lemmas = useTable<Row>("lemmas");
  const conjectures = useTable<Row>("conjectures");
  const proofs = useTable<Row>("proofs");

  const loading =
    sets.isLoading ||
    axioms.isLoading ||
    definitions.isLoading ||
    theorems.isLoading ||
    lemmas.isLoading ||
    conjectures.isLoading ||
    proofs.isLoading;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto max-w-3xl px-6 py-10">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            MathGraph
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Mathematics as it actually is: a problem leads to a theorem, a
            theorem to a proof, a proof back to axioms.
          </p>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-12 px-6 py-10">
        {loading && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        <Section title="Sets" rows={sets.data} bodyKey="description" />
        <Section title="Axioms" rows={axioms.data} bodyKey="statement" />
        <Section
          title="Definitions"
          rows={definitions.data}
          bodyKey="statement"
        />
        <Section title="Theorems" rows={theorems.data} bodyKey="statement" />
        <Section title="Lemmas" rows={lemmas.data} bodyKey="statement" />
        <Section
          title="Conjectures"
          rows={conjectures.data}
          bodyKey="statement"
        />
        <Section title="Proofs" rows={proofs.data} bodyKey="statement" />
      </main>
    </div>
  );
}
