import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
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

type Kind = "axiom" | "definition" | "conjecture" | "theorem" | "lemma" | "proof";
type Row = {
  id: string;
  date: string | null;
  name: string;
  creator: string | null;
  statement: string;
  citation: string | null;
  theorem_id?: string;
};
type Item = Row & { kind: Kind };
type CardData = { item: Item };

const NODE_W = 260;
const COL_GAP = 120;
const ROW_GAP = 40;
const NODE_H = 155;

async function fetchGraph() {
  const tables = [
    ["axioms", "axiom"],
    ["definitions", "definition"],
    ["conjectures", "conjecture"],
    ["theorems", "theorem"],
    ["lemmas", "lemma"],
    ["proofs", "proof"],
  ] as const;
  const results = await Promise.all(
    tables.map(([t]) => supabase.from(t).select("*").order("name")),
  );
  const items: Item[] = [];
  results.forEach((r, i) => {
    if (r.error) throw r.error;
    for (const row of (r.data ?? []) as unknown as Row[])
      items.push({ ...row, kind: tables[i]![1] });
  });
  const uses = await supabase.from("theorem_uses").select("theorem_id, used_id");
  if (uses.error) throw uses.error;
  return { items, uses: uses.data ?? [] };
}

function Card({ data }: NodeProps<Node<CardData>>) {
  const { item } = data;
  const meta = [item.date ?? "?", item.creator ?? "?"].join(" · ");
  return (
    <div
      className="rounded-md border border-foreground/80 bg-background p-3 text-left shadow-sm"
      style={{ width: NODE_W }}
    >
      <Handle type="target" position={Position.Left} className="!bg-foreground" />
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {item.kind}
        </span>
        <span className="truncate text-[10px] text-muted-foreground">{meta}</span>
      </div>
      <h3 className="mt-1 text-sm font-semibold leading-tight text-foreground">
        {item.name}
      </h3>
      <p className="mt-1 line-clamp-3 text-xs leading-snug text-foreground/75">
        {item.statement}
      </p>
      {item.citation && (
        <p className="mt-1.5 line-clamp-1 border-t border-border pt-1.5 text-[10px] italic text-muted-foreground">
          {item.citation}
        </p>
      )}
      <Handle type="source" position={Position.Right} className="!bg-foreground" />
    </div>
  );
}

const nodeTypes = { card: Card };

function buildGraph(items: Item[], uses: { theorem_id: string; used_id: string }[]) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const deps = new Map<string, string[]>();
  for (const u of uses) {
    if (!byId.has(u.used_id) || !byId.has(u.theorem_id)) continue;
    deps.set(u.theorem_id, [...(deps.get(u.theorem_id) ?? []), u.used_id]);
  }
  // Depth = longest chain back to foundations
  const depth = new Map<string, number>();
  const visit = (id: string, stack = new Set<string>()): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (stack.has(id)) return 0;
    stack.add(id);
    const it = byId.get(id)!;
    let d = 0;
    if (it.kind === "theorem") {
      const ds = deps.get(id) ?? [];
      d = ds.length ? 1 + Math.max(...ds.map((x) => visit(x, stack))) : 1;
    } else if ((it.kind === "lemma" || it.kind === "proof") && it.theorem_id && byId.has(it.theorem_id)) {
      d = visit(it.theorem_id, stack) + 1;
    }
    depth.set(id, d);
    return d;
  };
  items.forEach((i) => visit(i.id));

  const cols = new Map<number, Item[]>();
  for (const i of items) {
    const d = depth.get(i.id)!;
    cols.set(d, [...(cols.get(d) ?? []), i]);
  }
  const nodes: Node<CardData>[] = [];
  for (const [d, list] of cols) {
    const total = list.length * (NODE_H + ROW_GAP);
    list.forEach((item, idx) => {
      nodes.push({
        id: item.id,
        type: "card",
        position: { x: d * (NODE_W + COL_GAP), y: idx * (NODE_H + ROW_GAP) - total / 2 },
        data: { item },
      });
    });
  }

  const edge = (source: string, target: string, dashed = false): Edge => ({
    id: `${source}-${target}`,
    source,
    target,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, color: "currentColor" },
    style: { stroke: "var(--foreground)", strokeWidth: 1.25, strokeDasharray: dashed ? "4 4" : undefined },
  });
  const edges: Edge[] = [];
  for (const [t, ds] of deps) for (const d of ds) edges.push(edge(d, t));
  for (const i of items)
    if ((i.kind === "lemma" || i.kind === "proof") && i.theorem_id && byId.has(i.theorem_id))
      edges.push(edge(i.theorem_id, i.id, true));
  return { nodes, edges };
}

function Index() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { data, isLoading, error } = useQuery({ queryKey: ["graph"], queryFn: fetchGraph });
  const graph = useMemo(() => (data ? buildGraph(data.items, data.uses) : null), [data]);

  return (
    <div className="relative h-screen w-screen bg-background">
      <header className="pointer-events-none absolute left-0 top-0 z-10 p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">MathGraph</h1>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          Arrows point from what is used to what it leads to. Drag to pan, scroll to zoom.
        </p>
      </header>
      {(isLoading || !mounted) && (
        <p className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">Loading…</p>
      )}
      {error && (
        <p className="absolute inset-0 grid place-items-center text-sm text-destructive">
          Could not load the graph.
        </p>
      )}
      {mounted && graph && (
        <ReactFlow
          nodes={graph.nodes}
          edges={graph.edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.2}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="var(--border)" gap={24} />
          <Controls showInteractive={false} />
        </ReactFlow>
      )}
    </div>
  );
}
