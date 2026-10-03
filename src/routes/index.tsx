import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  BaseEdge,
  getBezierPath,
  useInternalNode,
  useNodesState,
  type Node,
  type Edge,
  type EdgeProps,
  type NodeProps,
  type OnNodesChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { supabase } from "@/integrations/supabase/client";
import { renderLatex } from "@/lib/latex.functions";
import { Bookmark, Pin } from "lucide-react";

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
type RelationGroup = { label: string; items: string[] };
type CardData = {
  item: Item;
  expanded?: boolean;
  relations?: RelationGroup[] | undefined;
  pinned?: boolean;
  onTogglePin?: (id: string) => void;
  inCollection?: boolean;
  onToggleCollection?: (id: string) => void;
};

type Collection = { id: string; name: string; ids: string[] };

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
  const sets = await supabase.from("sets").select("id, name");
  if (sets.error) throw sets.error;
  const setElements = await supabase.from("set_elements").select("set_id, element_id");
  if (setElements.error) throw setElements.error;
  return { items, uses: uses.data ?? [], sets: sets.data ?? [], setElements: setElements.data ?? [] };
}

// Splits text into plain and $...$ math segments
function splitMath(text: string): { text: string; math: boolean }[] {
  const parts: { text: string; math: boolean }[] = [];
  const re = /\$([^$]+)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), math: false });
    parts.push({ text: m[1]!, math: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), math: false });
  return parts;
}

function Latex({ tex }: { tex: string }) {
  const { data } = useQuery({
    queryKey: ["latex", tex],
    queryFn: () => renderLatex({ data: { tex } }),
    staleTime: Infinity,
  });
  if (!data) return <span className="text-muted-foreground">{tex}</span>;
  // Server-rendered SVG served to the node as an image
  const src = `data:image/svg+xml;utf8,${encodeURIComponent(data.svg)}`;
  return <img src={src} alt={tex} className="inline-block h-[1.2em] w-auto align-[-0.2em]" />;
}

function RichText({ text }: { text: string }) {
  const parts = useMemo(() => splitMath(text), [text]);
  return (
    <>
      {parts.map((p, i) =>
        p.math ? <Latex key={i} tex={p.text} /> : <span key={i}>{p.text}</span>,
      )}
    </>
  );
}

const KIND_STYLES: Record<Kind, { border: string; label: string; chip: string }> = {
  axiom: { border: "border-l-amber-500", label: "text-amber-600", chip: "bg-amber-500" },
  definition: { border: "border-l-sky-500", label: "text-sky-600", chip: "bg-sky-500" },
  conjecture: { border: "border-l-rose-500", label: "text-rose-600", chip: "bg-rose-500" },
  theorem: { border: "border-l-emerald-500", label: "text-emerald-600", chip: "bg-emerald-500" },
  lemma: { border: "border-l-violet-500", label: "text-violet-600", chip: "bg-violet-500" },
  proof: { border: "border-l-slate-500", label: "text-slate-600", chip: "bg-slate-500" },
};

function Card({ data }: NodeProps<Node<CardData>>) {
  const { item, expanded, relations, pinned, onTogglePin, inCollection, onToggleCollection } = data;
  const meta = [item.date ?? "?", item.creator ?? "?"].join(" · ");
  const style = KIND_STYLES[item.kind];
  return (
    <div
      className={`cursor-pointer rounded-md border border-foreground/80 border-l-4 bg-background p-3 text-left shadow-sm transition-shadow hover:shadow-md ${style.border}`}
      style={{ width: expanded ? 340 : NODE_W }}
    >
      <Handle type="target" position={Position.Left} className="!opacity-0 !pointer-events-none" isConnectable={false} />
      <div className="flex items-baseline justify-between gap-2">
        <span className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest ${style.label}`}>
          <span className={`inline-block h-2 w-2 rounded-full ${style.chip}`} />
          {item.kind}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[10px] text-muted-foreground">{meta}</span>
          {onToggleCollection && (
            <button
              title={inCollection ? "Remove from collection" : "Add to collection"}
              onClick={(e) => {
                e.stopPropagation();
                onToggleCollection(item.id);
              }}
              className={`nodrag rounded p-0.5 transition-colors ${
                inCollection ? "text-foreground" : "text-muted-foreground/40 hover:text-muted-foreground"
              }`}
            >
              <Bookmark className="h-3 w-3" fill={inCollection ? "currentColor" : "none"} />
            </button>
          )}
          <button
            title={pinned ? "Unpin — let it move freely" : "Pin — keep it in place"}
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin?.(item.id);
            }}
            className={`nodrag rounded p-0.5 transition-colors ${
              pinned ? "text-foreground" : "text-muted-foreground/40 hover:text-muted-foreground"
            }`}
          >
            <Pin className="h-3 w-3" fill={pinned ? "currentColor" : "none"} />
          </button>
        </span>
      </div>
      <h3 className="mt-1 text-sm font-semibold leading-tight text-foreground">
        {item.name}
      </h3>
      <p
        className={`mt-1 text-xs leading-snug text-foreground/75 ${expanded ? "" : "line-clamp-3"}`}
      >
        <RichText text={item.statement} />
      </p>
      {item.citation && (
        <p
          className={`mt-1.5 border-t border-border pt-1.5 text-[10px] italic text-muted-foreground ${expanded ? "" : "line-clamp-1"}`}
        >
          {item.citation}
        </p>
      )}
      {expanded && (
        <dl className="mt-2 space-y-1 border-t border-border pt-2 text-[10px]">
          <div className="flex gap-2">
            <dt className="w-14 shrink-0 font-semibold uppercase tracking-wider text-muted-foreground">Type</dt>
            <dd className="capitalize text-foreground/80">{item.kind}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-14 shrink-0 font-semibold uppercase tracking-wider text-muted-foreground">Date</dt>
            <dd className="text-foreground/80">{item.date ?? "Unknown"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-14 shrink-0 font-semibold uppercase tracking-wider text-muted-foreground">Creator</dt>
            <dd className="text-foreground/80">{item.creator ?? "Unknown"}</dd>
          </div>
          {item.citation && (
            <div className="flex gap-2">
              <dt className="w-14 shrink-0 font-semibold uppercase tracking-wider text-muted-foreground">Source</dt>
              <dd className="italic text-foreground/80">{item.citation}</dd>
            </div>
          )}
        </dl>
      )}
      {expanded && relations && relations.length > 0 && (
        <div className="mt-2 space-y-1.5 border-t border-border pt-2">
          {relations.map((g) => (
            <div key={g.label}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {g.label}
              </p>
              <ul className="mt-0.5 space-y-0.5 text-[11px] leading-snug text-foreground/80">
                {g.items.map((r, i) => (
                  <li key={i}>• {r}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {expanded && (
        <p className="mt-1.5 text-[10px] text-muted-foreground">Click again to collapse</p>
      )}
      <Handle type="source" position={Position.Right} className="!opacity-0 !pointer-events-none" isConnectable={false} />
    </div>
  );
}

const nodeTypes = { card: Card };

// Floating edge: the connection points are recomputed from the nodes' current
// rectangles on every render, so each line leaves the box on the side facing
// the other box (and arrowheads stay glued to the boxes, never mid-bend).
function FloatingEdge({ id, source, target, label, markerEnd, markerStart, style }: EdgeProps) {
  const sn = useInternalNode(source);
  const tn = useInternalNode(target);
  if (!sn || !tn) return null;
  const w = (n: typeof sn | typeof tn) => n.measured?.width ?? NODE_W;
  const h = (n: typeof sn | typeof tn) => n.measured?.height ?? NODE_H;
  const sc = { x: sn.internals.positionAbsolute.x + w(sn) / 2, y: sn.internals.positionAbsolute.y + h(sn) / 2 };
  const tc = { x: tn.internals.positionAbsolute.x + w(tn) / 2, y: tn.internals.positionAbsolute.y + h(tn) / 2 };
  const dx = tc.x - sc.x;
  const dy = tc.y - sc.y;
  // Point where the ray from a box center toward the other exits its rectangle
  const bound = (cx: number, cy: number, bw: number, bh: number, vx: number, vy: number) => {
    if (vx === 0 && vy === 0) return { x: cx, y: cy };
    const s = Math.min(vx === 0 ? Infinity : bw / 2 / Math.abs(vx), vy === 0 ? Infinity : bh / 2 / Math.abs(vy));
    return { x: cx + vx * s, y: cy + vy * s };
  };
  const p1 = bound(sc.x, sc.y, w(sn), h(sn), dx, dy);
  const p2 = bound(tc.x, tc.y, w(tn), h(tn), -dx, -dy);
  // Bezier control direction follows the dominant axis so the curve starts flat
  const horiz = Math.abs(dx) >= Math.abs(dy);
  const [path, labelX, labelY] = getBezierPath({
    sourceX: p1.x,
    sourceY: p1.y,
    sourcePosition: horiz ? (dx >= 0 ? Position.Right : Position.Left) : dy >= 0 ? Position.Bottom : Position.Top,
    targetX: p2.x,
    targetY: p2.y,
    targetPosition: horiz ? (dx >= 0 ? Position.Left : Position.Right) : dy >= 0 ? Position.Top : Position.Bottom,
  });
  const text = typeof label === "string" ? label : undefined;
  const tw = text ? text.length * 6 + 10 : 0;
  return (
    <g>
      <BaseEdge id={id} path={path} {...(markerEnd ? { markerEnd } : {})} {...(markerStart ? { markerStart } : {})} style={style} />
      {text && (
        <>
          <rect
            className="react-flow__edge-textbg"
            x={labelX - tw / 2}
            y={labelY - 8}
            width={tw}
            height={16}
            rx={3}
          />
          <text className="react-flow__edge-text" x={labelX} y={labelY} textAnchor="middle" dominantBaseline="central">
            {text}
          </text>
        </>
      )}
    </g>
  );
}

const edgeTypes = { floating: FloatingEdge };

// Arrowheads per relation: open chevron = used by, filled square (QED) = proved
// by, hollow circle = has lemma. auto-start-reverse lets them serve as start heads.
function EdgeMarkers() {
  const common = {
    markerUnits: "userSpaceOnUse" as const,
    orient: "auto-start-reverse",
    markerWidth: 22,
    markerHeight: 22,
    viewBox: "-11 -11 22 22",
    refX: 0,
    refY: 0,
  };
  return (
    <svg width="0" height="0" className="absolute" style={{ color: "var(--foreground)" }} aria-hidden>
      <defs>
        <marker id="mg-uses" {...common} refX={0}>
          <path d="M -10 -7 L 0 0 L -10 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </marker>
        <marker id="mg-proof" {...common} refX={0}>
          <rect x="-11" y="-5.5" width="11" height="11" fill="currentColor" />
        </marker>
        <marker id="mg-lemma" {...common} refX={0}>
          <circle cx="-6" cy="0" r="5" fill="var(--background)" stroke="currentColor" strokeWidth="1.8" />
        </marker>
      </defs>
    </svg>
  );
}

function buildGraph(
  items: Item[],
  uses: { theorem_id: string; used_id: string }[],
  sets: { id: string; name: string }[],
  setElements: { set_id: string; element_id: string }[],
) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const setById = new Map(sets.map((s) => [s.id, s]));
  const deps = new Map<string, string[]>();
  for (const u of uses) {
    if (!byId.has(u.used_id) || !byId.has(u.theorem_id)) continue;
    deps.set(u.theorem_id, [...(deps.get(u.theorem_id) ?? []), u.used_id]);
  }

  // Human-readable relations for the expanded card, grouped by relation type
  const relMap = new Map<string, Map<string, string[]>>();
  const relate = (id: string, label: string, text: string) => {
    let g = relMap.get(id);
    if (!g) relMap.set(id, (g = new Map()));
    g.set(label, [...(g.get(label) ?? []), text]);
  };
  for (const [t, ds] of deps) {
    const theorem = byId.get(t)!;
    for (const d of ds) {
      const used = byId.get(d)!;
      relate(t, "Uses", `${used.name} (${used.kind})`);
      relate(d, "Used by", `${theorem.name} (${theorem.kind})`);
    }
  }
  for (const i of items) {
    if ((i.kind === "lemma" || i.kind === "proof") && i.theorem_id && byId.has(i.theorem_id)) {
      const theorem = byId.get(i.theorem_id)!;
      relate(i.id, i.kind === "lemma" ? "Lemma of" : "Proof of", theorem.name);
      relate(theorem.id, i.kind === "lemma" ? "Lemmas" : "Proofs", i.name);
    }
  }
  for (const se of setElements) {
    const set = setById.get(se.set_id);
    if (set && byId.has(se.element_id)) relate(se.element_id, "In sets", set.name);
  }
  const toGroups = (g?: Map<string, string[]>): RelationGroup[] | undefined =>
    g ? [...g.entries()].map(([label, items]) => ({ label, items })) : undefined;
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
        data: { item, relations: toGroups(relMap.get(item.id)) },
      });
    });
  }

  // Each relation type gets its own arrowhead (SVG markers defined in EdgeMarkers).
  const markerFor = (label: string) =>
    label === "has proof" ? "mg-proof" : label === "has lemma" ? "mg-lemma" : "mg-uses";
  const edge = (source: string, target: string, label: string, dashed = false, startLabel?: string): Edge => ({
    id: `${source}-${target}`,
    source,
    target,
    type: "floating", // anchors recomputed each frame: leaves the box on the facing side
    label,
    data: { relation: label },
    markerEnd: markerFor(label),
    ...(startLabel ? { markerStart: markerFor(startLabel) } : {}),
    style: { stroke: "var(--foreground)", strokeWidth: 1.25, strokeDasharray: dashed ? "4 4" : undefined },
  });
  // Collect all relations, then merge back-and-forth pairs into a single
  // double-headed edge.
  const raw: { source: string; target: string; label: string; dashed: boolean }[] = [];
  for (const [t, ds] of deps) for (const d of ds) raw.push({ source: d, target: t, label: "is used by", dashed: false });
  for (const i of items)
    if ((i.kind === "lemma" || i.kind === "proof") && i.theorem_id && byId.has(i.theorem_id))
      raw.push({ source: i.theorem_id, target: i.id, label: i.kind === "proof" ? "has proof" : "has lemma", dashed: true });
  const edges: Edge[] = [];
  const merged = new Set<string>();
  for (const r of raw) {
    const fwd = `${r.source}-${r.target}`;
    const bwd = `${r.target}-${r.source}`;
    if (merged.has(fwd)) continue;
    const back = raw.find((o) => o.source === r.target && o.target === r.source);
    if (back) {
      merged.add(fwd);
      merged.add(bwd);
      edges.push({
        ...edge(r.source, r.target, `${r.label} / ${back.label}`, r.dashed && back.dashed, back.label),
        markerEnd: markerFor(r.label),
        data: { relation: "both" },
        id: `${fwd}--both`,
      });
    } else {
      merged.add(fwd);
      edges.push(edge(r.source, r.target, r.label, r.dashed));
    }
  }
  }
  return { nodes, edges };
}

// Force simulation: every pair of boxes repels (stronger when close, hard push
// when overlapping), connected boxes are pulled by springs toward a resting
// left-to-right offset, and a weak pull keeps the graph centred. Velocities are
// damped so the layout settles into equilibrium; dragged boxes stay pinned.
type Vel = { vx: number; vy: number };
type SimEdge = { source: string; target: string };

const REPULSION = 700000; // inverse-square strength — dominates all other forces
const REPULSE_RANGE = 1200;
const SPRING_K = 0.004;
const REST_DX = NODE_W + 110; // used item sits to the left of what uses it
const GRAVITY = 0.0012;
const DAMPING = 0.85;
const MAX_SPEED = 30;
const REST_SPEED = 0.3;
const UNTANGLE = 4; // gentle push between crossing edges
const SET_PULL = 0.002; // pull toward the centre of each set the box belongs to
const KIND_PULL = 0.0008; // weaker pull toward the centre of the box's kind
const ALPHA_DECAY = 0.985; // "temperature" cools every frame so the graph always settles
const ALPHA_MIN = 0.004;

// Segment intersection test (proper crossings only; shared endpoints excluded by caller)
function segmentsCross(
  ax: number, ay: number, bx: number, by: number,
  cx2: number, cy2: number, dx: number, dy: number,
): boolean {
  const orient = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
    (qy - py) * (rx - qx) - (qx - px) * (ry - qy);
  const o1 = orient(ax, ay, bx, by, cx2, cy2);
  const o2 = orient(ax, ay, bx, by, dx, dy);
  const o3 = orient(cx2, cy2, dx, dy, ax, ay);
  const o4 = orient(cx2, cy2, dx, dy, bx, by);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

function forceStep(
  nodes: Node<CardData>[],
  edges: SimEdge[],
  vels: Map<string, Vel>,
  pinned: Set<string>,
  groups: Map<string, { kind: string; sets: string[] }>,
  alpha: number,
): Node<CardData>[] {
  if (nodes.length === 0) return nodes;
  const anyDrag = nodes.some((n) => n.dragging);
  if (alpha < ALPHA_MIN && !anyDrag) vels.clear();
  const cool = alpha < ALPHA_MIN && !anyDrag;
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  const fx = new Float64Array(nodes.length);
  const fy = new Float64Array(nodes.length);
  const cx = (n: Node) => n.position.x + NODE_W / 2;
  const cy = (n: Node) => n.position.y + NODE_H / 2;

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!;
      const b = nodes[j]!;
      let dx = cx(b) - cx(a);
      let dy = cy(b) - cy(a);
      if (dx === 0 && dy === 0) {
        dx = Math.random() - 0.5;
        dy = Math.random() - 0.5;
      }
      const raw = Math.hypot(dx, dy);
      if (raw > REPULSE_RANGE) continue;
      const dist = Math.max(raw, 60); // clamp: avoids huge forces at tiny distances
      const fade = 1 - raw / REPULSE_RANGE; // smooth falloff, no jump at the range edge
      let f = (REPULSION / (dist * dist)) * fade * fade;
      const overlapX = NODE_W + 60 - Math.abs(dx);
      const overlapY = NODE_H + 60 - Math.abs(dy);
      if (overlapX > 0 && overlapY > 0) f += Math.min(overlapX, overlapY) * 0.4;
      const ux = dx / dist;
      const uy = dy / dist;
      fx[i]! -= f * ux;
      fy[i]! -= f * uy;
      fx[j]! += f * ux;
      fy[j]! += f * uy;
    }
  }

  for (const e of edges) {
    const i = idx.get(e.source);
    const j = idx.get(e.target);
    if (i === undefined || j === undefined) continue;
    const a = nodes[i]!;
    const b = nodes[j]!;
    const ex = cx(b) - cx(a) - REST_DX;
    const ey = cy(b) - cy(a);
    fx[i]! += ex * SPRING_K;
    fy[i]! += ey * SPRING_K;
    fx[j]! -= ex * SPRING_K;
    fy[j]! -= ey * SPRING_K;
  }

  // Clustering: each box is pulled toward the centre of its sets and (more
  // weakly) of its kind. Pulling toward a group centre keeps the force size
  // independent of group size, so big groups don't collapse.
  const centres = new Map<string, { x: number; y: number; n: number }>();
  const add = (key: string, n: Node) => {
    const c = centres.get(key) ?? { x: 0, y: 0, n: 0 };
    c.x += cx(n); c.y += cy(n); c.n++;
    centres.set(key, c);
  };
  nodes.forEach((n) => {
    const g = groups.get(n.id);
    if (!g) return;
    add("k:" + g.kind, n);
    g.sets.forEach((s) => add("s:" + s, n));
  });
  nodes.forEach((n, i) => {
    const g = groups.get(n.id);
    if (!g) return;
    const pull = (key: string, k: number) => {
      const c = centres.get(key);
      if (!c || c.n < 2) return;
      fx[i]! += (c.x / c.n - cx(n)) * k;
      fy[i]! += (c.y / c.n - cy(n)) * k;
    };
    pull("k:" + g.kind, KIND_PULL);
    g.sets.forEach((s) => pull("s:" + s, SET_PULL));
  });

  // Untangle: any two crossing edges push their endpoints apart along the
  // line between their midpoints, so the layout works toward planarity.
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const e1 = edges[i]!;
      const e2 = edges[j]!;
      if (
        e1.source === e2.source || e1.source === e2.target ||
        e1.target === e2.source || e1.target === e2.target
      )
        continue;
      const a = idx.get(e1.source);
      const b = idx.get(e1.target);
      const c = idx.get(e2.source);
      const d = idx.get(e2.target);
      if (a === undefined || b === undefined || c === undefined || d === undefined) continue;
      const na = nodes[a]!;
      const nb = nodes[b]!;
      const nc = nodes[c]!;
      const nd = nodes[d]!;
      if (!segmentsCross(cx(na), cy(na), cx(nb), cy(nb), cx(nc), cy(nc), cx(nd), cy(nd)))
        continue;
      let ux = (cx(na) + cx(nb)) / 2 - (cx(nc) + cx(nd)) / 2;
      let uy = (cy(na) + cy(nb)) / 2 - (cy(nc) + cy(nd)) / 2;
      const len = Math.hypot(ux, uy) || 1;
      ux /= len;
      uy /= len;
      fx[a]! += ux * UNTANGLE;
      fy[a]! += uy * UNTANGLE;
      fx[b]! += ux * UNTANGLE;
      fy[b]! += uy * UNTANGLE;
      fx[c]! -= ux * UNTANGLE;
      fy[c]! -= uy * UNTANGLE;
      fx[d]! -= ux * UNTANGLE;
      fy[d]! -= uy * UNTANGLE;
    }
  }

  let mx = 0;
  let my = 0;
  for (const n of nodes) {
    mx += cx(n);
    my += cy(n);
  }
  mx /= nodes.length;
  my /= nodes.length;

  let moving = false;
  const next = nodes.map((n, i) => {
    if (cool) return n;
    if (n.dragging || pinned.has(n.id)) {
      vels.set(n.id, { vx: 0, vy: 0 });
      if (n.dragging) moving = true;
      return n;
    }
    const v = vels.get(n.id) ?? { vx: 0, vy: 0 };
    let vx = (v.vx + (fx[i]! + (mx - cx(n)) * GRAVITY) * alpha) * DAMPING;
    let vy = (v.vy + (fy[i]! + (my - cy(n)) * GRAVITY) * alpha) * DAMPING;
    const sp = Math.hypot(vx, vy);
    if (sp > MAX_SPEED) {
      vx = (vx / sp) * MAX_SPEED;
      vy = (vy / sp) * MAX_SPEED;
    }
    // Dead zone: kill tiny residual velocities so boxes stop dead instead of
    // oscillating around equilibrium (the "wobble").
    if (sp < REST_SPEED) {
      vels.set(n.id, { vx: 0, vy: 0 });
      return n;
    }
    // Extra braking at low speed so motion decays smoothly into the dead zone
    if (sp < 2.5) {
      vx *= 0.6;
      vy *= 0.6;
    }
    vels.set(n.id, { vx, vy });
    moving = true;
    return { ...n, position: { x: n.position.x + vx, y: n.position.y + vy } };
  });
  // Collision pass: directly separate overlapping boxes (position-based, so it
  // can't oscillate) and keep a clear gap between neighbours.
  const GAP = 50;
  for (let iter = 0; iter < 2; iter++) {
    for (let i = 0; i < next.length; i++) {
      for (let j = i + 1; j < next.length; j++) {
        const a = next[i]!;
        const b = next[j]!;
        const dx = b.position.x - a.position.x;
        const dy = b.position.y - a.position.y;
        const ox = NODE_W + GAP - Math.abs(dx);
        const oy = NODE_H + GAP - Math.abs(dy);
        if (ox <= 0.5 || oy <= 0.5) continue;
        const fa = a.dragging || pinned.has(a.id) ? 0 : 1;
        const fb = b.dragging || pinned.has(b.id) ? 0 : 1;
        if (fa + fb === 0) continue;
        const push = (ox < oy ? ox : oy) / (fa + fb);
        const sx = ox < oy ? (dx >= 0 ? 1 : -1) : 0;
        const sy = ox < oy ? 0 : dy >= 0 ? 1 : -1;
        if (fa) next[i] = { ...a, position: { x: a.position.x - sx * push * fa, y: a.position.y - sy * push * fa } };
        if (fb) next[j] = { ...b, position: { x: b.position.x + sx * push * fb, y: b.position.y + sy * push * fb } };
        moving = true;
      }
    }
  }
  // Edge clearance: a box may not sit on a line it isn't part of. Push the box
  // off the line (and the line's ends slightly the other way), position-based.
  const pos = new Map(next.map((n, i) => [n.id, i]));
  const free = (n: Node) => !n.dragging && !pinned.has(n.id);
  for (const e of edges) {
    const si = pos.get(e.source);
    const ti = pos.get(e.target);
    if (si === undefined || ti === undefined) continue;
    for (let k = 0; k < next.length; k++) {
      if (k === si || k === ti) continue;
      const s = next[si]!, t = next[ti]!, n = next[k]!;
      const ax = cx(s), ay = cy(s), bx = cx(t), by = cy(t);
      const vx = bx - ax, vy = by - ay;
      const len2 = vx * vx + vy * vy;
      if (len2 < 1) continue;
      const u = ((cx(n) - ax) * vx + (cy(n) - ay) * vy) / len2;
      if (u <= 0.02 || u >= 0.98) continue;
      const px = ax + u * vx, py = ay + u * vy;
      let nx = cx(n) - px, ny = cy(n) - py;
      let d = Math.hypot(nx, ny);
      if (d < 0.01) { nx = -vy; ny = vx; d = Math.hypot(nx, ny); }
      nx /= d; ny /= d;
      const need = Math.abs(nx) * NODE_W / 2 + Math.abs(ny) * NODE_H / 2 + 20;
      const dd = Math.hypot(cx(n) - px, cy(n) - py);
      if (dd >= need - 0.5) continue;
      const push = (need - dd) * 0.525;
      const mv = (i: number, f: number) => {
        const m = next[i]!;
        if (!free(m)) return;
        next[i] = { ...m, position: { x: m.position.x + nx * push * f, y: m.position.y + ny * push * f } };
        moving = true;
      };
      mv(k, 1);
      mv(si, -0.3);
      mv(ti, -0.3);
    }
  }
  return moving ? next : nodes; // same array => no re-render once settled
}

const LAYOUT_KEY = "mathgraph-layout-v1";
const COLLECTIONS_KEY = "mathgraph-collections";
const STRONG_KEY = "mathgraph-strong-edges";

function Index() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { data, isLoading, error } = useQuery({ queryKey: ["graph"], queryFn: fetchGraph });
  const graph = useMemo(
    () => (data ? buildGraph(data.items, data.uses, data.sets, data.setElements) : null),
    [data],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<CardData>>([] as Node<CardData>[]);
  const vels = useRef(new Map<string, Vel>());
  const pinnedRef = useRef(new Set<string>());
  const [savedFlash, setSavedFlash] = useState(false);
  // Signed-in user: preferences live in the account; otherwise in this browser.
  const [authReady, setAuthReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      userIdRef.current = data.user?.id ?? null;
      setUserId(data.user?.id ?? null);
      setEmail(data.user?.email ?? null);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT") return;
      userIdRef.current = session?.user.id ?? null;
      setUserId(session?.user.id ?? null);
      setEmail(session?.user.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  const persist = (patch: { layout?: unknown; collections?: Collection[]; strong_edges?: string[] }) => {
    const uid = userIdRef.current;
    if (uid) {
      void supabase
        .from("user_preferences")
        .upsert({ user_id: uid, ...patch, updated_at: new Date().toISOString() } as never);
    } else {
      if (patch.layout !== undefined) localStorage.setItem(LAYOUT_KEY, JSON.stringify(patch.layout));
      if (patch.collections !== undefined)
        localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(patch.collections));
      if (patch.strong_edges !== undefined)
        localStorage.setItem(STRONG_KEY, JSON.stringify(patch.strong_edges));
    }
  };
  // Floating always starts enabled on each visit; the toggle lasts for the session.
  const [floating, setFloating] = useState(true);
  const floatingRef = useRef(floating);
  const toggleFloating = () => {
    const next = !floatingRef.current;
    floatingRef.current = next;
    setFloating(next);
  };

  // Collections: named groups of nodes; optionally show only the active one
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [showOnly, setShowOnly] = useState(false);
  const active = collections.find((c) => c.id === activeId) ?? null;
  const updateCollections = (next: Collection[]) => {
    setCollections(next);
    persist({ collections: next });
  };
  const newCollection = () => {
    const name = window.prompt("Name of the new collection")?.trim();
    if (!name) return;
    const c = { id: crypto.randomUUID(), name, ids: [] };
    updateCollections([...collections, c]);
    setActiveId(c.id);
  };
  const deleteCollection = () => {
    if (!active || !window.confirm(`Delete collection "${active.name}"?`)) return;
    updateCollections(collections.filter((c) => c.id !== active.id));
    setActiveId("");
    setShowOnly(false);
  };
  const toggleInCollection = (id: string) => {
    if (!active) return;
    const ids = active.ids.includes(id) ? active.ids.filter((x) => x !== id) : [...active.ids, id];
    updateCollections(collections.map((c) => (c.id === active.id ? { ...c, ids } : c)));
  };
  const visible = useMemo(
    () => (active && showOnly ? new Set(active.ids) : null),
    [active, showOnly],
  );
  const viewNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        hidden: visible ? !visible.has(n.id) : false,
        data: {
          ...n.data,
          inCollection: active?.ids.includes(n.id) ?? false,
          onToggleCollection: active ? toggleInCollection : undefined,
        },
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, visible, active, collections],
  );
  // Strong edges: canonical connections. A theorem has exactly one canonical
  // proof; "used by" and lemma links can be canonical many times over.
  const [strongEdges, setStrongEdges] = useState<string[]>([]);
  const toggleStrong = (e: Edge) => {
    // Definition edges are always dotted and can never be canonical.
    if (graph?.nodes.find((n) => n.id === e.source)?.data.item.kind === "definition") return;
    const isStrong = strongEdges.includes(e.id);
    const ends = (id: string) => graph?.edges.find((x) => x.id === id);
    const isProof = (x?: Edge) => (x?.data as { relation?: string } | undefined)?.relation === "has proof";
    const next = isStrong
      ? strongEdges.filter((x) => x !== e.id)
      : [
          ...strongEdges.filter((x) => {
            if (!isProof(e)) return true;
            const o = ends(x);
            // Only one canonical proof per theorem
            return !o || !(isProof(o) && o.source === e.source);
          }),
          e.id,
        ];
    setStrongEdges(next);
    persist({ strong_edges: next });
  };
  const viewEdges = useMemo(() => {
    if (!graph) return [];
    const list = visible
      ? graph.edges.filter((e) => visible.has(e.source) && visible.has(e.target))
      : graph.edges;
    const kindOf = (id: string) => graph.nodes.find((n) => n.id === id)?.data.item.kind;
    return list.map((e) => {
      // Definitions get their own dotted line: theorems lean on many of them,
      // so they never compete for the single canonical slot.
      if (kindOf(e.source) === "definition") {
        return {
          ...e,
          style: { stroke: "var(--foreground)", strokeWidth: 1.25, strokeDasharray: "2 4" },
        };
      }
      const strong = strongEdges.includes(e.id);
      return {
        ...e,
        label: strong ? `${e.label} (canonical)` : e.label,
        style: {
          stroke: "var(--foreground)",
          strokeWidth: strong ? 3 : 1.25,
          strokeDasharray: strong ? undefined : "5 5",
          cursor: "pointer",
        },
      };
    });
  }, [graph, visible, strongEdges]);

  const saveLayout = (ns: Node<CardData>[]) => {
    const layout: Record<string, { x: number; y: number; pinned: boolean }> = {};
    for (const n of ns)
      layout[n.id] = { x: n.position.x, y: n.position.y, pinned: pinnedRef.current.has(n.id) };
    persist({ layout });
  };

  function togglePin(id: string) {
    // Compute outside the state updater: StrictMode double-invokes updaters,
    // which would toggle the pin twice and save the wrong state.
    const nowPinned = !pinnedRef.current.has(id);
    if (nowPinned) pinnedRef.current.add(id);
    else pinnedRef.current.delete(id);
    setNodes((ns) =>
      ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, pinned: nowPinned } } : n)),
    );
    setTimeout(() => setNodes((ns) => (saveLayout(ns), ns)), 0); // persist once
  }

  // Restore the saved layout (positions + pins) and floating setting
  useEffect(() => {
    if (!graph || !authReady) return;
    let cancelled = false;
    (async () => {
      let saved: Record<string, { x: number; y: number; pinned: boolean }> = {};
      let cols: Collection[] = [];
      let strong: string[] = [];
      if (userId) {
        const { data: row } = await supabase
          .from("user_preferences" as never)
          .select("layout, collections, strong_edges")
          .eq("user_id", userId)
          .maybeSingle();
        const r = row as { layout: typeof saved; collections: Collection[]; strong_edges: string[] } | null;
        cols = r?.collections ?? [];
        saved = r?.layout ?? {};
        strong = r?.strong_edges ?? [];
      } else {
        try {
          saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "{}");
        } catch {
          saved = {};
        }
        try {
          cols = JSON.parse(localStorage.getItem(COLLECTIONS_KEY) ?? "[]");
        } catch {
          cols = [];
        }
        try {
          strong = JSON.parse(localStorage.getItem(STRONG_KEY) ?? "[]");
        } catch {
          strong = [];
        }
      }
      if (cancelled) return;
      setCollections(cols);
      setStrongEdges(strong);
      setActiveId("");
      setShowOnly(false);
      pinnedRef.current = new Set(
        Object.entries(saved).filter(([, v]) => v.pinned).map(([k]) => k),
      );
      setNodes(
        graph.nodes.map((n) => {
          const s = saved[n.id];
          return {
            ...n,
            position: s ? { x: s.x, y: s.y } : n.position,
            data: { ...n.data, pinned: !!s?.pinned, onTogglePin: togglePin },
          };
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [graph, setNodes, authReady, userId]);

  const saveLayoutRef = useRef(saveLayout);
  saveLayoutRef.current = saveLayout;
  // Animation loop: run the force simulation until it settles
  const simEdges = useMemo<SimEdge[]>(
    () => (graph ? graph.edges.map((e) => ({ source: e.source, target: e.target })) : []),
    [graph],
  );
  // Group membership for the clustering forces: kind + sets per node
  const simGroups = useMemo(() => {
    const m = new Map<string, { kind: string; sets: string[] }>();
    if (!data) return m;
    for (const it of data.items) m.set(it.id, { kind: it.kind, sets: [] });
    for (const se of data.setElements) m.get(se.element_id)?.sets.push(se.set_id);
    return m;
  }, [data]);
  useEffect(() => {
    let raf = 0;
    let wasMoving = false;
    let alpha = 1;
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      if (floatingRef.current)
        setNodes((ns) => {
          if (ns.some((n) => n.dragging)) alpha = Math.max(alpha, 0.5);
          alpha *= ALPHA_DECAY;
          const next = forceStep(ns, simEdges, vels.current, pinnedRef.current, simGroups, alpha);
          const moving = next !== ns;
          // Once the graph comes to rest, save that equilibrium so a refresh
          // starts already settled.
          if (wasMoving && !moving && ns.length && !ns.some((n) => n.dragging)) {
            clearTimeout(saveTimer);
            saveTimer = setTimeout(() => saveLayoutRef.current(ns), 0);
          }
          wasMoving = moving;
          return next;
        });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(saveTimer);
    };
  }, [setNodes, simEdges]);

  const toggleExpand = (id: string) =>
    setNodes((ns) =>
      ns.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, expanded: !n.data.expanded } } : n,
      ),
    );

  const [flow, setFlow] = useState<ReactFlowInstance | null>(null);
  // Re-fit the view once, after the initial layout has had time to settle
  useEffect(() => {
    if (!flow || !graph) return;
    const t = setTimeout(() => flow.fitView({ padding: 0.2, duration: 800 }), 2500);
    return () => clearTimeout(t);
  }, [flow, graph]);
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
      <div className="absolute right-0 top-0 z-10 w-60 p-6">
        <div className="pointer-events-auto flex flex-col gap-2 text-xs">
          <button
            onClick={() => {
              saveLayout(nodes);
              setSavedFlash(true);
              setTimeout(() => setSavedFlash(false), 1500);
            }}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-foreground shadow-sm transition-colors hover:bg-muted"
          >
            {savedFlash ? "Layout saved ✓" : "Save layout"}
          </button>
          <button
            onClick={toggleFloating}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-foreground shadow-sm transition-colors hover:bg-muted"
          >
            {floating ? "Disable floating" : "Enable floating"}
          </button>
          <div className="relative">
            <select
              value={activeId}
              onChange={(e) => {
                setActiveId(e.target.value);
                if (!e.target.value) setShowOnly(false);
              }}
              style={{ textAlignLast: "center" }}
              className="w-full appearance-none rounded-md border border-border bg-background px-9 py-1.5 text-center text-foreground shadow-sm"
            >
              <option value="">No collection</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.ids.length})
                </option>
              ))}
            </select>
            <svg
              className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
          <button
            onClick={newCollection}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-foreground shadow-sm transition-colors hover:bg-muted"
          >
            New collection
          </button>
          {active && (
            <button
              onClick={() => setShowOnly((v) => !v)}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-foreground shadow-sm transition-colors hover:bg-muted"
            >
              {showOnly ? "Show all nodes" : "Show only this collection"}
            </button>
          )}
          {active && (
            <button
              onClick={deleteCollection}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-foreground shadow-sm transition-colors hover:bg-muted"
            >
              Delete collection
            </button>
          )}
          {active && (
            <p className="text-[11px] leading-snug text-muted-foreground">
              Click the bookmark on a box to add it to or remove it from “{active.name}”.
            </p>
          )}
        </div>
      </div>
      <div className="pointer-events-auto absolute bottom-0 right-0 z-10 p-6 text-xs text-muted-foreground">
        {userId ? (
          <span>
            Signed in as {email} — your layout is saved to your account.{" "}
            <button onClick={() => supabase.auth.signOut()} className="underline">
              Sign out
            </button>
          </span>
        ) : (
          <span>
            <Link to="/auth" className="underline">Sign in</Link> to keep your layout on any device.
          </span>
        )}
      </div>
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
          nodes={viewNodes}
          edges={viewEdges}
          onNodesChange={onNodesChange as OnNodesChange<Node>}
          onNodeClick={(_, node) => toggleExpand(node.id)}
          onEdgeClick={(_, e) => toggleStrong(e)}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
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
      <EdgeMarkers />
      <div className="pointer-events-none absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-5 rounded-md border bg-background/90 px-4 py-2 text-xs text-muted-foreground">
        {[
          ["mg-uses", "used by"],
          ["mg-proof", "proved by"],
          ["mg-lemma", "has lemma"],
        ].map(([m, t]) => (
          <span key={m} className="flex items-center gap-1.5">
            <svg width="34" height="14" className="text-foreground">
              <line x1="2" y1="7" x2="24" y2="7" stroke="currentColor" strokeWidth="1.25" markerEnd={`url(#${m})`} />
            </svg>
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
