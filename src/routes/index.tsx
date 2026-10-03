import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  type Node,
  type Edge,
  type NodeProps,
  type OnNodesChange,
  type ReactFlowInstance,
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
type CardData = { item: Item; expanded?: boolean };

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
  const { item, expanded } = data;
  const meta = [item.date ?? "?", item.creator ?? "?"].join(" · ");
  return (
    <div
      className="cursor-pointer rounded-md border border-foreground/80 bg-background p-3 text-left shadow-sm transition-shadow hover:shadow-md"
      style={{ width: expanded ? 340 : NODE_W }}
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
      <p
        className={`mt-1 text-xs leading-snug text-foreground/75 ${expanded ? "" : "line-clamp-3"}`}
      >
        {item.statement}
      </p>
      {item.citation && (
        <p
          className={`mt-1.5 border-t border-border pt-1.5 text-[10px] italic text-muted-foreground ${expanded ? "" : "line-clamp-1"}`}
        >
          {item.citation}
        </p>
      )}
      {expanded && (
        <p className="mt-1.5 text-[10px] text-muted-foreground">Click again to collapse</p>
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

  // Adjacency across adjacent columns (both directions) for crossing reduction
  const neighbors = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    neighbors.set(a, [...(neighbors.get(a) ?? []), b]);
    neighbors.set(b, [...(neighbors.get(b) ?? []), a]);
  };
  for (const [t, ds] of deps) for (const d of ds) link(d, t);
  for (const i of items)
    if ((i.kind === "lemma" || i.kind === "proof") && i.theorem_id && byId.has(i.theorem_id))
      link(i.theorem_id, i.id);

  // Barycenter ordering: repeatedly sort each column by the average position
  // of its neighbors in adjacent columns to minimize edge crossings.
  const colKeys = [...cols.keys()].sort((a, b) => a - b);
  const posOf = new Map<string, number>();
  const reindex = () => {
    for (const k of colKeys) cols.get(k)!.forEach((it, idx) => posOf.set(it.id, idx));
  };
  reindex();
  for (let pass = 0; pass < 8; pass++) {
    const forward = pass % 2 === 0;
    const keys = forward ? colKeys : [...colKeys].reverse();
    for (const k of keys) {
      const list = cols.get(k)!;
      const bary = (it: Item) => {
        const ns = (neighbors.get(it.id) ?? [])
          .map((n) => posOf.get(n))
          .filter((p): p is number => p !== undefined);
        return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : posOf.get(it.id)!;
      };
      list.sort((a, b) => bary(a) - bary(b));
    }
    reindex();
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
    type: "default", // bezier curve — bends around boxes instead of cutting through
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

// Gentle physics: nodes repel when their boxes overlap, with damped velocity
// (kept in a side map) so they feel slightly inert rather than snapping.
type Vel = { vx: number; vy: number };

function repelStep(nodes: Node<CardData>[], vels: Map<string, Vel>): Node<CardData>[] {
  let anyOverlap = false;
  const delta = new Map<string, { x: number; y: number }>();
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!;
      const b = nodes[j]!;
      const dx = b.position.x - a.position.x;
      const dy = b.position.y - a.position.y;
      const overlapX = NODE_W + 24 - Math.abs(dx);
      const overlapY = NODE_H + 24 - Math.abs(dy);
      if (overlapX > 0 && overlapY > 0) {
        anyOverlap = true;
        const push = 0.05;
        const da = delta.get(a.id) ?? { x: 0, y: 0 };
        const db = delta.get(b.id) ?? { x: 0, y: 0 };
        if (overlapX < overlapY) {
          const f = overlapX * push * (dx >= 0 ? 1 : -1);
          da.x -= f;
          db.x += f;
        } else {
          const f = overlapY * push * (dy >= 0 ? 1 : -1);
          da.y -= f;
          db.y += f;
        }
        delta.set(a.id, da);
        delta.set(b.id, db);
      }
    }
  }
  if (!anyOverlap) {
    vels.clear();
    return nodes;
  }
  const damping = 0.82;
  return nodes.map((n) => {
    const d = delta.get(n.id);
    const v = vels.get(n.id) ?? { vx: 0, vy: 0 };
    if (!d && Math.abs(v.vx) < 0.05 && Math.abs(v.vy) < 0.05) return n;
    const nv = { vx: (v.vx + (d?.x ?? 0)) * damping, vy: (v.vy + (d?.y ?? 0)) * damping };
    vels.set(n.id, nv);
    return { ...n, position: { x: n.position.x + nv.vx, y: n.position.y + nv.vy } };
  });
}

function Index() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { data, isLoading, error } = useQuery({ queryKey: ["graph"], queryFn: fetchGraph });
  const graph = useMemo(() => (data ? buildGraph(data.items, data.uses) : null), [data]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<CardData>>([] as Node<CardData>[]);
  const vels = useRef(new Map<string, Vel>());
  useEffect(() => {
    if (graph) setNodes(graph.nodes);
  }, [graph, setNodes]);

  // Animation loop: keep nudging while any boxes overlap
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setNodes((ns) => repelStep(ns, vels.current));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [setNodes]);

  const toggleExpand = (id: string) =>
    setNodes((ns) =>
      ns.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, expanded: !n.data.expanded } } : n,
      ),
    );

  const [flow, setFlow] = useState<ReactFlowInstance | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !data) return [];
    return data.items
      .filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.statement.toLowerCase().includes(q) ||
          (i.creator ?? "").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [query, data]);

  const goTo = (item: Item) => {
    const node = nodes.find((n) => n.id === item.id);
    if (!node || !flow) return;
    flow.setCenter(node.position.x + NODE_W / 2, node.position.y + NODE_H / 2, {
      zoom: 1.1,
      duration: 600,
    });
    setQuery(item.name);
    setOpen(false);
  };

  return (
    <div className="relative h-screen w-screen bg-background">
      <header className="pointer-events-none absolute left-0 top-0 z-10 p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">MathGraph</h1>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          Arrows point from what is used to what it leads to. Drag to pan, scroll to zoom.
        </p>
        <div className="pointer-events-auto relative mt-3 w-72">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && matches[0]) goTo(matches[0]);
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Search theorems, axioms, proofs…"
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground shadow-sm outline-none placeholder:text-muted-foreground focus:border-foreground/60"
          />
          {open && matches.length > 0 && (
            <ul className="absolute mt-1 w-full overflow-hidden rounded-md border border-border bg-background shadow-md">
              {matches.map((m) => (
                <li key={m.id}>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => goTo(m)}
                    className="flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <span className="shrink-0 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {m.kind}
                    </span>
                    <span className="truncate">{m.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
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
          nodes={nodes}
          edges={graph.edges}
          onNodesChange={onNodesChange as OnNodesChange<Node>}
          onNodeClick={(_, node) => toggleExpand(node.id)}
          nodeTypes={nodeTypes}
          onInit={setFlow}
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
