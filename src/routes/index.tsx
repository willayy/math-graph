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
  useStore,
  ViewportPortal,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { supabase } from "@/integrations/supabase/client";
import { SubmissionsMenu } from "@/components/SubmissionsMenu";
import { renderLatex } from "@/lib/latex.functions";
import { Bookmark, Pin } from "lucide-react";
import defaultGraphLayout from "@/lib/default-graph-layout.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MathGraph — the dependency graph of mathematics" },
      {
        name: "description",
        content:
          "MathGraph maps mathematics as it actually is: axioms, definitions, theorems and proofs connected by what they use and what they lead to.",
      },
      { property: "og:title", content: "MathGraph — the dependency graph of mathematics" },
      {
        property: "og:description",
        content:
          "Axioms, definitions, theorems and proofs — connected by what they use and what they lead to.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type Kind = "axiom" | "definition" | "conjecture" | "theorem" | "proof";
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
  tracing?: boolean;
  onTrace?: (id: string) => void;
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
  proof: { border: "border-l-slate-500", label: "text-slate-600", chip: "bg-slate-500" },
};

function Card({ data }: NodeProps<Node<CardData>>) {
  const { item, expanded, relations, pinned, onTogglePin, inCollection, onToggleCollection, tracing, onTrace } = data;
  const meta = [item.date ?? "?", item.creator ?? "?"].join(" · ");
  const style = KIND_STYLES[item.kind];
  const zoom = useStore((st) => st.transform[2]);
  // Begin revealing detail while still zoomed out; keep the same box and
  // handles mounted throughout so changing modes never jolts the layout.
  const detailOpacity = clamp01((zoom - 0.32) / 0.2);
  return (
    <div
      className={`relative cursor-pointer rounded-md border border-foreground/80 border-l-4 bg-background p-3 text-left shadow-sm transition-shadow hover:shadow-md ${style.border}`}
      style={{ width: expanded ? 340 : NODE_W, minHeight: NODE_H }}
    >
      <Handle type="target" position={Position.Left} className="!opacity-0 !pointer-events-none" isConnectable={false} />
      <div
        className="pointer-events-none absolute inset-3 flex items-center justify-center text-center transition-opacity duration-200"
        style={{ opacity: 1 - detailOpacity }}
        aria-hidden={detailOpacity === 1}
      >
        <span className="line-clamp-3 text-3xl font-semibold leading-tight text-foreground">{item.name}</span>
      </div>
      <div className="transition-opacity duration-200" style={{ opacity: detailOpacity, pointerEvents: detailOpacity < 0.85 ? "none" : "auto" }}>
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
        {zoom > 0.32 ? <RichText text={item.statement} /> : item.statement.replace(/\$/g, "")}
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
      {expanded && onTrace && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTrace(item.id);
          }}
          className="nodrag mt-2 w-full rounded border border-border px-2 py-1 text-[11px] hover:bg-muted"
        >
          {tracing ? "Show everything" : "Show canonical trace only"}
        </button>
      )}
      {expanded && (
        <p className="mt-1.5 text-[10px] text-muted-foreground">Click again to collapse</p>
      )}
      </div>
      <Handle type="source" position={Position.Right} className="!opacity-0 !pointer-events-none" isConnectable={false} />
    </div>
  );
}

const nodeTypes = { card: Card };

const SET_OVERVIEW_ZOOM = 0.12;
const SET_MARGIN = 55;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const nodeWidth = (node: Node<CardData>) => node.measured?.width ?? (node.data.expanded ? 340 : NODE_W);
const nodeHeight = (node: Node<CardData>) => node.measured?.height ?? NODE_H;

// Use the same anchors and Bezier controls as the rendered edge when checking
// whether another card occupies its buffered path.
function edgePoints(source: Node<CardData>, target: Node<CardData>) {
  const center = (n: Node<CardData>) => ({ x: n.position.x + nodeWidth(n) / 2, y: n.position.y + nodeHeight(n) / 2 });
  const a = center(source), b = center(target);
  const dx = b.x - a.x, dy = b.y - a.y;
  const bound = (n: Node<CardData>, c: typeof a, vx: number, vy: number) => {
    const scale = Math.min(vx ? nodeWidth(n) / 2 / Math.abs(vx) : Infinity, vy ? nodeHeight(n) / 2 / Math.abs(vy) : Infinity);
    return { x: c.x + vx * scale, y: c.y + vy * scale };
  };
  if (!dx && !dy) return [];
  const start = bound(source, a, dx, dy), end = bound(target, b, -dx, -dy);
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const offset = (distance: number) => distance >= 0 ? distance / 2 : 6.25 * Math.sqrt(-distance);
  const distance = horizontal ? end.x - start.x : end.y - start.y;
  const direction = horizontal ? Math.sign(dx) : Math.sign(dy);
  const control = offset(distance * direction) * direction;
  const c1 = { x: start.x + (horizontal ? control : 0), y: start.y + (horizontal ? 0 : control) };
  const c2 = { x: end.x - (horizontal ? control : 0), y: end.y - (horizontal ? 0 : control) };
  return Array.from({ length: 17 }, (_, i) => {
    const t = i / 16, s = 1 - t;
    return {
      x: s ** 3 * start.x + 3 * s ** 2 * t * c1.x + 3 * s * t ** 2 * c2.x + t ** 3 * end.x,
      y: s ** 3 * start.y + 3 * s ** 2 * t * c1.y + 3 * s * t ** 2 * c2.y + t ** 3 * end.y,
    };
  });
}

function clearEdgeCorridors(nodes: Node<CardData>[], edges: SimEdge[], pinned: Set<string>) {
  const next = [...nodes];
  const byId = new Map(next.map((n, i) => [n.id, i]));
  let moved = false;
  for (let pass = 0; pass < 16; pass++) {
    let changed = false;
    for (const edge of edges) {
      const si = byId.get(edge.source), ti = byId.get(edge.target);
      if (si === undefined || ti === undefined) continue;
      const points = edgePoints(next[si]!, next[ti]!);
      if (!points.length) continue;
      for (let i = 0; i < next.length; i++) {
        if (i === si || i === ti) continue;
        const node = next[i]!;
        const cx = node.position.x + nodeWidth(node) / 2;
        const cy = node.position.y + nodeHeight(node) / 2;
        let best: { x: number; y: number; distance: number; need: number } | null = null;
        for (let j = 1; j < points.length; j++) {
          const a = points[j - 1]!, b = points[j]!;
          const vx = b.x - a.x, vy = b.y - a.y;
          const u = Math.max(0, Math.min(1, ((cx - a.x) * vx + (cy - a.y) * vy) / (vx * vx + vy * vy || 1)));
          const px = a.x + u * vx, py = a.y + u * vy;
          let nx = cx - px, ny = cy - py;
          let distance = Math.hypot(nx, ny);
          if (distance < 0.01) { nx = -vy; ny = vx; distance = Math.hypot(nx, ny) || 1; }
          nx /= distance; ny /= distance;
          const need = Math.abs(nx) * nodeWidth(node) / 2 + Math.abs(ny) * nodeHeight(node) / 2 + EDGE_BUFFER;
          if (!best || distance < best.distance) best = { x: nx, y: ny, distance, need };
        }
        if (!best || best.distance >= best.need - 0.5) continue;
        const push = best.need - best.distance + 1;
        const movable = !node.dragging && !pinned.has(node.id);
        if (movable) {
          next[i] = { ...node, position: { x: node.position.x + best.x * push, y: node.position.y + best.y * push } };
          changed = true;
          moved = true;
        } else {
          // A pinned or dragged obstruction stays put; move the line's endpoints instead.
          for (const endpoint of [si, ti]) {
            const other = next[endpoint]!;
            if (other.dragging || pinned.has(other.id)) continue;
            next[endpoint] = { ...other, position: { x: other.position.x - best.x * push, y: other.position.y - best.y * push } };
            changed = true;
            moved = true;
          }
        }
      }
    }
    if (!changed) break;
  }
  return moved ? next : nodes;
}

// A convex outline follows the actual member boxes instead of enclosing unrelated
// nodes in a large rectangular bounding box.
function setHull(points: { x: number; y: number }[]) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (a: typeof points[number], b: typeof points[number], c: typeof points[number]) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const lower: typeof points = [];
  for (const p of sorted) {
    while (lower.length > 1 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: typeof points = [];
  for (const p of sorted.reverse()) {
    while (upper.length > 1 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// Move the smaller, freely movable set as a unit only when two padded hulls
// actually intersect. This preserves the spacing inside each set and leaves
// saved layouts untouched when their outlines are already separate.
function separateSetOutlines(
  nodes: Node<CardData>[],
  members: { set_id: string; element_id: string }[],
  pinned: Set<string>,
) {
  const groups = new Map<string, Set<string>>();
  for (const { set_id, element_id } of members) {
    if (!groups.has(set_id)) groups.set(set_id, new Set());
    groups.get(set_id)?.add(element_id);
  }
  const hullFor = (ids: Set<string>, list: Node<CardData>[]) => setHull(list.flatMap((node) => {
    if (!ids.has(node.id)) return [];
    const { x, y } = node.position;
    const right = x + nodeWidth(node) + SET_MARGIN;
    const bottom = y + nodeHeight(node) + SET_MARGIN;
    return [
      { x: x - SET_MARGIN, y: y - SET_MARGIN }, { x: right, y: y - SET_MARGIN },
      { x: right, y: bottom }, { x: x - SET_MARGIN, y: bottom },
    ];
  }));
  const entries = [...groups.entries()];
  let result = nodes;
  for (let pass = 0; pass < entries.length; pass++) {
    let moved = false;
    for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
      const [aId, a] = entries[i]!;
      const [bId, b] = entries[j]!;
      const aHull = hullFor(a, result), bHull = hullFor(b, result);
      if (aHull.length < 3 || bHull.length < 3) continue;
      const axes = [aHull, bHull].flatMap((hull) => hull.map((point, k) => {
        const next = hull[(k + 1) % hull.length]!;
        const dx = next.x - point.x, dy = next.y - point.y;
        const length = Math.hypot(dx, dy) || 1;
        return { x: -dy / length, y: dx / length };
      }));
      let separation: { x: number; y: number; distance: number } | null = null;
      let intersects = true;
      for (const axis of axes) {
        const projection = (hull: typeof aHull) => {
          const values = hull.map((point) => point.x * axis.x + point.y * axis.y);
          return { min: Math.min(...values), max: Math.max(...values) };
        };
        const pa = projection(aHull), pb = projection(bHull);
        const forward = pa.max - pb.min, backward = pb.max - pa.min;
        if (forward <= 0 || backward <= 0) { intersects = false; break; }
        const distance = Math.min(forward, backward);
        if (!separation || distance < separation.distance)
          separation = { x: axis.x * (forward <= backward ? 1 : -1), y: axis.y * (forward <= backward ? 1 : -1), distance };
      }
      if (!intersects || !separation) continue;
      const movable = (ids: Set<string>, other: Set<string>) =>
        [...ids].every((id) => !pinned.has(id) && !other.has(id));
      const candidates = [
        { id: aId, ids: a, sign: -1, allowed: movable(a, b) },
        { id: bId, ids: b, sign: 1, allowed: movable(b, a) },
      ].filter((candidate) => candidate.allowed).sort((left, right) => left.ids.size - right.ids.size);
      const choice = candidates[0];
      if (!choice) continue;
      const { x, y, distance } = separation;
      result = result.map((node) => choice.ids.has(node.id) ? {
        ...node,
        position: { x: node.position.x + x * (distance + 12) * choice.sign,
          y: node.position.y + y * (distance + 12) * choice.sign },
      } : node);
      moved = true;
    }
    if (!moved) break;
  }
  return result;
}

function SetOutlines({
  nodes,
  sets,
  members,
  visible,
}: {
  nodes: Node<CardData>[];
  sets: { id: string; name: string }[];
  members: { set_id: string; element_id: string }[];
  visible: Set<string> | null;
}) {
  const zoom = useStore((state) => state.transform[2]);
  const detailOpacity = clamp01((zoom - 0.095) / 0.05);
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const outlines = useMemo(() => sets.map((set) => {
    const corners: { x: number; y: number }[] = [];
    for (const member of members) {
      if (member.set_id !== set.id || (visible && !visible.has(member.element_id))) continue;
      const node = nodeById.get(member.element_id);
      if (!node) continue;
      const { x, y } = node.position;
      const width = nodeWidth(node);
      const height = nodeHeight(node);
      corners.push(
        { x: x - SET_MARGIN, y: y - SET_MARGIN },
        { x: x + width + SET_MARGIN, y: y - SET_MARGIN },
        { x: x + width + SET_MARGIN, y: y + height + SET_MARGIN },
        { x: x - SET_MARGIN, y: y + height + SET_MARGIN },
      );
    }
    if (!corners.length) return null;
    const hull = setHull(corners);
    const left = Math.min(...hull.map((p) => p.x));
    const right = Math.max(...hull.map((p) => p.x));
    const top = Math.min(...hull.map((p) => p.y));
    const bottom = Math.max(...hull.map((p) => p.y));
    return { ...set, hull, left, right, top, bottom };
  }).filter((outline): outline is NonNullable<typeof outline> => outline !== null), [sets, members, visible, nodeById]);

  return (
    <ViewportPortal>
      {outlines.map((set) => (
        <div key={set.id} className="pointer-events-none absolute left-0 top-0">
          <svg className="absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden="true">
            <path
              d={`M ${set.hull.map((p) => `${p.x} ${p.y}`).join(" L ")} Z`}
              fill="none"
              stroke="var(--muted-foreground)"
              strokeWidth={Math.max(2, 1.1 / zoom)}
              strokeDasharray={`${Math.max(12, 8 / zoom)} ${Math.max(10, 6 / zoom)}`}
              opacity="0.6"
            />
          </svg>
           {(["detail", "overview"] as const).map((level) => (
             <span
               key={level}
               className={`absolute block whitespace-nowrap bg-background px-2 text-center font-semibold leading-tight text-foreground ${level === "overview" ? "text-lg" : "text-sm"}`}
               style={{
                 left: (set.left + set.right) / 2,
                 top: level === "overview" ? (set.top + set.bottom) / 2 : set.top - 18 / zoom,
                 transform: `translate(-50%, -50%) scale(${1 / zoom})`,
                 opacity: level === "overview" ? 1 - detailOpacity : detailOpacity,
               }}
             >
               {set.name}
             </span>
           ))}
        </div>
      ))}
    </ViewportPortal>
  );
}

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

// Shared trigger style for the grouped menu bar segments.
const segmentBtn =
  "relative z-30 flex flex-1 items-center justify-center gap-1 whitespace-nowrap px-2 py-2 text-center text-xs font-medium sm:px-3 lg:px-4 lg:py-2.5 lg:text-sm text-foreground transition-colors hover:bg-muted";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`pointer-events-none h-3 w-3 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

// View dropdown: layout saving, position reset, canonical filter, trace clear.
function ViewMenu(props: {
  open: boolean;
  setOpen: (v: boolean) => void;
  savedFlash: boolean;
  onSave: () => void;
  onReset: () => void;
  canonicalOnly: boolean;
  onToggleCanonical: (v: boolean) => void;
  traceActive: boolean;
  onClearTrace: () => void;
}) {
  const { open, setOpen } = props;
  const item = "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted";
  return (
    <div className="relative flex flex-1">
      <button onClick={() => setOpen(!open)} className={`${segmentBtn} rounded-l-xl`}>
        View <Chevron open={open} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-md border border-border bg-background shadow-md">
            <p className="border-b border-border px-3 pb-1.5 pt-2.5 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
              View &amp; layout
            </p>
            <div className="py-1">
              <button
                onClick={() => {
                  props.onSave();
                  setOpen(false);
                }}
                className={item}
              >
                {props.savedFlash ? "Layout saved ✓" : "Save layout"}
              </button>
              <button onClick={props.onReset} className={item}>
                Reset positions
              </button>
              <label className={`${item} cursor-pointer`}>
                Canonical relations only
                <input
                  type="checkbox"
                  checked={props.canonicalOnly}
                  onChange={(e) => props.onToggleCanonical(e.target.checked)}
                  className="accent-foreground"
                />
              </label>
              {props.traceActive && (
                <button
                  onClick={() => {
                    props.onClearTrace();
                    setOpen(false);
                  }}
                  className={item}
                >
                  Clear canonical trace
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function FiltersMenu(props: {
  open: boolean;
  setOpen: (open: boolean) => void;
  sets: { id: string; name: string }[];
  filterSet: string;
  setFilterSet: (value: string) => void;
  filterKind: string;
  setFilterKind: (value: string) => void;
}) {
  return (
    <div className="relative flex flex-1">
      <button onClick={() => props.setOpen(!props.open)} className={segmentBtn} aria-expanded={props.open}>
        Filters <Chevron open={props.open} />
      </button>
      {props.open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => props.setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-60 space-y-2 rounded-md border border-border bg-background p-3 shadow-md">
            <label htmlFor="set-filter" className="block text-[10px] font-semibold uppercase text-muted-foreground">Set</label>
            <select id="set-filter" value={props.filterSet} onChange={(e) => props.setFilterSet(e.target.value)} className="w-full bg-background text-xs text-foreground outline-none">
              <option value="">All sets</option>
              {props.sets.map((set) => <option key={set.id} value={set.id}>{set.name}</option>)}
            </select>
            <label htmlFor="kind-filter" className="block text-[10px] font-semibold uppercase text-muted-foreground">Node type</label>
            <select id="kind-filter" value={props.filterKind} onChange={(e) => props.setFilterKind(e.target.value)} className="w-full bg-background text-xs text-foreground outline-none">
              <option value="">All types</option>
              {(["axiom", "definition", "conjecture", "theorem", "proof"] as const).map((kind) => (
                <option key={kind} value={kind}>{kind.replace(/^./, (letter) => letter.toUpperCase())}</option>
              ))}
            </select>
          </div>
        </>
      )}
    </div>
  );
}

// Pages dropdown: links to the change history and about pages.
function PagesMenu({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  return (
    <div className="relative flex flex-1">
      <button onClick={() => setOpen(!open)} className={segmentBtn}>
        Pages <Chevron open={open} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-md border border-border bg-background shadow-md">
            <div className="py-1">
              <Link to="/history" className="block px-3 py-1.5 text-xs hover:bg-muted" onClick={() => setOpen(false)}>
                Change history
              </Link>
              <Link to="/about" className="block px-3 py-1.5 text-xs hover:bg-muted" onClick={() => setOpen(false)}>
                About
              </Link>
              <Link to="/verify" className="block px-3 py-1.5 text-xs hover:bg-muted" onClick={() => setOpen(false)}>
                Verify identity
              </Link>
              <Link to="/admin" className="block px-3 py-1.5 text-xs hover:bg-muted" onClick={() => setOpen(false)}>
                Admin review queue
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Collections dropdown: a button that opens a panel listing every collection
// (with its size and a checkmark on the active one) plus the actions that used
// to be separate buttons — new, show-only, delete.
function CollectionsMenu(props: {
  collections: Collection[];
  activeId: string;
  activeName: string | undefined;
  showOnly: boolean;
  open: boolean;
  setOpen: (v: boolean) => void;
  onSelect: (id: string) => void;
  onToggleShowOnly: () => void;
  onNew: () => void;
  onDelete: () => void;
}) {
  const { open, setOpen, collections, activeId, activeName, showOnly } = props;
  return (
    <div className="relative flex flex-1">
      <button onClick={() => setOpen(!open)} className={`${segmentBtn} rounded-r-xl`}>
        <span className="max-w-24 truncate">{activeName ?? "Collections"}</span>
        <Chevron open={open} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-full min-w-52 overflow-hidden rounded-md border border-border bg-background shadow-md">
          <p className="border-b border-border px-3 pb-1.5 pt-2.5 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
            Collections
          </p>
          <div className="max-h-48 overflow-y-auto py-1">
            <button
              onClick={() => props.onSelect("")}
              className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-muted"
            >
              <span className={activeId ? "text-muted-foreground" : "font-medium"}>No collection</span>
              {!activeId && <CheckIcon />}
            </button>
            {collections.map((c) => (
              <button
                key={c.id}
                onClick={() => props.onSelect(c.id)}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted"
              >
                <span className={`truncate ${c.id === activeId ? "font-medium" : ""}`}>{c.name}</span>
                <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
                  {c.ids.length}
                  {c.id === activeId && <CheckIcon />}
                </span>
              </button>
            ))}
            {collections.length === 0 && (
              <p className="px-3 py-1.5 text-xs text-muted-foreground">No collections yet.</p>
            )}
          </div>
          <div className="border-t border-border py-1">
            <button
              onClick={props.onNew}
              className="w-full px-3 py-1.5 text-left text-xs hover:bg-muted"
            >
              + New collection
            </button>
            {activeId && (
              <>
                <button
                  onClick={props.onToggleShowOnly}
                  className="w-full px-3 py-1.5 text-left text-xs hover:bg-muted"
                >
                  {showOnly ? "Show all nodes" : "Show only this collection"}
                </button>
                <button
                  onClick={props.onDelete}
                  className="w-full px-3 py-1.5 text-left text-xs text-destructive hover:bg-muted"
                >
                  Delete collection
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

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
    if (i.kind === "proof" && i.theorem_id && byId.has(i.theorem_id)) {
      const theorem = byId.get(i.theorem_id)!;
      relate(i.id, "Proof of", theorem.name);
      relate(theorem.id, "Proofs", i.name);
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
    } else if (it.kind === "proof" && it.theorem_id && byId.has(it.theorem_id)) {
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
    if (i.kind === "proof" && i.theorem_id && byId.has(i.theorem_id))
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
    label === "has proof" ? "mg-proof" : "mg-uses";
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
    if (i.kind === "proof" && i.theorem_id && byId.has(i.theorem_id))
      raw.push({ source: i.theorem_id, target: i.id, label: "has proof", dashed: true });
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
  return { nodes, edges };
}

// Force simulation: every pair of boxes repels (stronger when close, hard push
// when overlapping), and a weak pull keeps the graph centred. Connected boxes
// are NOT pulled together — edges only draw lines, they exert no force.
// Velocities are damped so the layout settles into equilibrium; dragged boxes
// stay pinned.
type Vel = { vx: number; vy: number };
type SimEdge = { source: string; target: string };

const REPULSION = 700000; // inverse-square strength — dominates all other forces
const REPULSE_RANGE = 1200;
const CENTER_PULL = 0.0012; // gentle pull toward the middle of the canvas
const DAMPING = 0.85;
const MAX_SPEED = 30;
const REST_SPEED = 0.3;
const UNTANGLE = 28; // prioritize uncrossing actual curved paths during settling
const SET_PULL = 0.00242; // pull toward the centre of each set the box belongs to
const KIND_PULL = 0.00088; // weaker pull toward the centre of the box's kind
const INTERSET_REPULSION = 0.95; // slightly less push between boxes in different sets
const SET_CENTER_SPACING = 2200; // keep set centres distinct without pushing them too far apart
const SET_CENTER_PUSH = 0.008;
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

// A discrete finishing pass can untangle crossings that gentle forces cannot
// escape: swapping two same-set cards changes their ordering without scattering
// the collection. Score the drawn curves, not straight lines between centres.
function crossingScore(nodes: Node<CardData>[], edges: SimEdge[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const paths = edges.map((edge) => {
    const source = byId.get(edge.source), target = byId.get(edge.target);
    return source && target ? edgePoints(source, target) : [];
  });
  let score = 0;
  for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
    const a = edges[i]!, b = edges[j]!;
    if (a.source === b.source || a.source === b.target || a.target === b.source || a.target === b.target) continue;
    const first = paths[i]!, second = paths[j]!;
    let crosses = false;
    for (let u = 1; u < first.length && !crosses; u++) for (let v = 1; v < second.length; v++) {
      const p = first[u - 1]!, q = first[u]!, r = second[v - 1]!, s = second[v]!;
      if (segmentsCross(p.x, p.y, q.x, q.y, r.x, r.y, s.x, s.y)) { crosses = true; break; }
    }
    if (crosses) score++;
  }
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i]!, b = nodes[j]!;
    const overlapX = Math.min(a.position.x + nodeWidth(a), b.position.x + nodeWidth(b)) - Math.max(a.position.x, b.position.x);
    const overlapY = Math.min(a.position.y + nodeHeight(a), b.position.y + nodeHeight(b)) - Math.max(a.position.y, b.position.y);
    if (overlapX > 0 && overlapY > 0) score += 5;
  }
  return score;
}

function polishCrossings(nodes: Node<CardData>[], edges: SimEdge[], groups: Map<string, { kind: string; sets: string[] }>, pinned: Set<string>) {
  let result = nodes;
  let best = crossingScore(result, edges);
  const linked = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  for (let pass = 0; pass < 8 && best > 0; pass++) {
    let candidate: Node<CardData>[] | null = null;
    for (let i = 0; i < result.length; i++) for (let j = i + 1; j < result.length; j++) {
      const a = result[i]!, b = result[j]!;
      if (!linked.has(a.id) && !linked.has(b.id)) continue;
      if (pinned.has(a.id) || pinned.has(b.id) || a.dragging || b.dragging) continue;
      const aSets = groups.get(a.id)?.sets ?? [], bSets = groups.get(b.id)?.sets ?? [];
      if (!aSets.length || !aSets.some((set) => bSets.includes(set))) continue;
      const trial = [...result];
      trial[i] = { ...a, position: b.position };
      trial[j] = { ...b, position: a.position };
      const score = crossingScore(trial, edges);
      if (score < best) { best = score; candidate = trial; }
    }
    if (!candidate) break;
    result = candidate;
  }
  return result;
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
  if (alpha < ALPHA_MIN && !anyDrag) {
    vels.clear();
    return clearEdgeCorridors(nodes, edges, pinned);
  }
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  const fx = new Float64Array(nodes.length);
  const fy = new Float64Array(nodes.length);
  const cx = (n: Node<CardData>) => n.position.x + nodeWidth(n) / 2;
  const cy = (n: Node<CardData>) => n.position.y + nodeHeight(n) / 2;

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
      const setsA = groups.get(a.id)?.sets ?? [];
      const setsB = groups.get(b.id)?.sets ?? [];
      if (setsA.length && setsB.length && !setsA.some((set) => setsB.includes(set)))
        f *= INTERSET_REPULSION;
      const overlapX = (nodeWidth(a) + nodeWidth(b)) / 2 + 60 - Math.abs(dx);
      const overlapY = (nodeHeight(a) + nodeHeight(b)) / 2 + 60 - Math.abs(dy);
      if (overlapX > 0 && overlapY > 0) f += Math.min(overlapX, overlapY) * 0.4;
      const ux = dx / dist;
      const uy = dy / dist;
      fx[i]! -= f * ux;
      fy[i]! -= f * uy;
      fx[j]! += f * ux;
      fy[j]! += f * uy;
    }
  }


  // Clustering: each box is pulled toward the centre of its sets and (more
  // weakly) of its kind. Pulling toward a group centre keeps the force size
  // independent of group size, so big groups don't collapse.
  const centres = new Map<string, { x: number; y: number; n: number }>();
  const add = (key: string, n: Node<CardData>) => {
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

  // Set centres have their own separation force. Shared-member sets cannot be
  // split cleanly, so only exclusively owned nodes receive this group push.
  const setCentres = [...centres.entries()].filter(([key]) => key.startsWith("s:"));
  for (let i = 0; i < setCentres.length; i++) for (let j = i + 1; j < setCentres.length; j++) {
    const [aKey, a] = setCentres[i]!;
    const [bKey, b] = setCentres[j]!;
    const dx = b.x / b.n - a.x / a.n, dy = b.y / b.n - a.y / a.n;
    const distance = Math.hypot(dx, dy);
    if (distance >= SET_CENTER_SPACING) continue;
    const ux = distance > 1 ? dx / distance : 1;
    const uy = distance > 1 ? dy / distance : 0;
    const push = Math.min(SET_CENTER_SPACING - distance, 500) * SET_CENTER_PUSH;
    nodes.forEach((n, index) => {
      const owned = groups.get(n.id)?.sets ?? [];
      const side = owned.includes(aKey.slice(2)) && !owned.includes(bKey.slice(2)) ? -1
        : owned.includes(bKey.slice(2)) && !owned.includes(aKey.slice(2)) ? 1 : 0;
      fx[index]! += ux * push * side;
      fy[index]! += uy * push * side;
    });
  }

  // Untangle the same sampled Bezier curves that are drawn on screen. Move the
  // endpoint nearest a crossing across the other curve rather than translating
  // both edges along their nearly coincident midpoints.
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
      const first = edgePoints(nodes[a]!, nodes[b]!);
      const second = edgePoints(nodes[c]!, nodes[d]!);
      let crossing: { x: number; y: number; nx: number; ny: number } | null = null;
      for (let u = 1; u < first.length && !crossing; u++) for (let v = 1; v < second.length; v++) {
        const p = first[u - 1]!, q = first[u]!;
        const r = second[v - 1]!, s = second[v]!;
        if (!segmentsCross(p.x, p.y, q.x, q.y, r.x, r.y, s.x, s.y)) continue;
        const length = Math.hypot(q.x - p.x, q.y - p.y) || 1;
        crossing = { x: (p.x + q.x + r.x + s.x) / 4, y: (p.y + q.y + r.y + s.y) / 4,
          nx: -(q.y - p.y) / length, ny: (q.x - p.x) / length };
        break;
      }
      if (!crossing) continue;
      const { x, y, nx, ny } = crossing;
      // Push the closer free endpoint across the first path, with the other
      // endpoint following weakly to avoid sharply bending the connecting edge.
      const choice = [c, d].filter((k) => !pinned.has(nodes[k]!.id) && !nodes[k]!.dragging)
        .sort((left, right) => Math.hypot(cx(nodes[left]!) - x, cy(nodes[left]!) - y)
          - Math.hypot(cx(nodes[right]!) - x, cy(nodes[right]!) - y))[0];
      if (choice !== undefined) {
        const signed = (cx(nodes[choice]!) - x) * nx + (cy(nodes[choice]!) - y) * ny;
        const direction = signed >= 0 ? 1 : -1;
        fx[choice]! += nx * direction * UNTANGLE;
        fy[choice]! += ny * direction * UNTANGLE;
      }
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
    if (n.dragging || pinned.has(n.id)) {
      vels.set(n.id, { vx: 0, vy: 0 });
      if (n.dragging) moving = true;
      return n;
    }
    const v = vels.get(n.id) ?? { vx: 0, vy: 0 };
    let vx = (v.vx + (fx[i]! + (mx - cx(n)) * CENTER_PULL) * alpha) * DAMPING;
    let vy = (v.vy + (fy[i]! + (my - cy(n)) * CENTER_PULL) * alpha) * DAMPING;
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
  // Separate actual measured rectangles, including expanded cards. Repeat
  // after edge clearance too, since moving an edge can crowd a neighbor.
  const GAP = 50;
  const separateBoxes = (iterations: number) => {
    for (let iter = 0; iter < iterations; iter++) {
      for (let i = 0; i < next.length; i++) {
        for (let j = i + 1; j < next.length; j++) {
        const a = next[i]!;
        const b = next[j]!;
        const ox = (nodeWidth(a) + nodeWidth(b)) / 2 + GAP - Math.abs(cx(b) - cx(a));
        const oy = (nodeHeight(a) + nodeHeight(b)) / 2 + GAP - Math.abs(cy(b) - cy(a));
        if (ox <= 0.5 || oy <= 0.5) continue;
        const fa = a.dragging || pinned.has(a.id) ? 0 : 1;
        const fb = b.dragging || pinned.has(b.id) ? 0 : 1;
        if (fa + fb === 0) continue;
        const push = (ox < oy ? ox : oy) / (fa + fb);
        const sx = ox < oy ? (cx(b) >= cx(a) ? 1 : -1) : 0;
        const sy = ox < oy ? 0 : cy(b) >= cy(a) ? 1 : -1;
        if (fa) next[i] = { ...a, position: { x: a.position.x - sx * push * fa, y: a.position.y - sy * push * fa } };
        if (fb) next[j] = { ...b, position: { x: b.position.x + sx * push * fb, y: b.position.y + sy * push * fb } };
        moving = true;
        }
      }
    }
  };
  separateBoxes(2);
  separateBoxes(8);
  const clear = clearEdgeCorridors(next, edges, pinned);
  return moving || clear !== next ? clear : nodes; // same array => no re-render once settled
}

const EDGE_BUFFER = 60;
const LAYOUT_KEY = "mathgraph-layout-v1";
const COLLECTIONS_KEY = "mathgraph-collections";
const STRONG_KEY = "mathgraph-strong-edges";
const defaultPositions: Record<string, { x: number; y: number }> = defaultGraphLayout;

function Index() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { data, isLoading, error } = useQuery({ queryKey: ["graph"], queryFn: fetchGraph });
  const graph = useMemo(
    () => (data ? buildGraph(data.items, data.uses, data.sets, data.setElements) : null),
    [data],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<CardData>>([] as Node<CardData>[]);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const initialLayoutRef = useRef(false);
  const reheatRef = useRef<() => void>(() => {});
  const handleNodesChange: typeof onNodesChange = (changes) => {
    if (!initialLayoutRef.current && changes.some((change) => change.type === "dimensions")) reheatRef.current();
    onNodesChange(changes);
  };
  const vels = useRef(new Map<string, Vel>());
  const pinnedRef = useRef(new Set<string>());
  const [savedFlash, setSavedFlash] = useState(false);
  // Signed-in user: preferences live in the account; otherwise in this browser.
  const [authReady, setAuthReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  useEffect(() => {
    if (!userId) { setFullName(null); return; }
    void (async () => {
      const { data: p } = await supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle();
      if (p) return setFullName(p.full_name);
      const { data: u } = await supabase.auth.getUser();
      let name = (u.user?.user_metadata?.["full_name"] as string | undefined)?.trim();
      while (!name || name.length < 2) {
        const entered = window.prompt("Please enter your full real name (shown on your contributions):");
        if (entered === null) return;
        name = entered.trim();
      }
      const { error } = await supabase.from("profiles").insert({ id: userId, full_name: name });
      if (!error) setFullName(name);
    })();
  }, [userId]);
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
  // Collections: named groups of nodes; optionally show only the active one
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [showOnly, setShowOnly] = useState(false);
  const [collOpen, setCollOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pagesOpen, setPagesOpen] = useState(false);
  const [subsOpen, setSubsOpen] = useState(false);
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
  // Canonical filters: hide non-canonical lines, or show only the chain of
  // canonical lines reachable from one box (in both directions).
  const [strongEdges, setStrongEdges] = useState<string[]>([]);
  const [canonicalOnly, setCanonicalOnly] = useState(false);
  const [setOverview, setSetOverview] = useState(false);
  const [filterSet, setFilterSet] = useState("");
  const [filterKind, setFilterKind] = useState("");
  const setMemberIds = useMemo(
    () => new Set(data?.setElements.filter((member) => member.set_id === filterSet).map((member) => member.element_id) ?? []),
    [data, filterSet],
  );
  const [traceId, setTraceId] = useState<string | null>(null);
  const trace = useMemo(() => {
    if (!traceId || !graph) return null;
    const strong = graph.edges.filter((e) => strongEdges.includes(e.id));
    const seen = new Set([traceId]);
    const queue = [traceId];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const e of strong) {
        const other = e.source === cur ? e.target : e.target === cur ? e.source : null;
        if (other && !seen.has(other)) {
          seen.add(other);
          queue.push(other);
        }
      }
    }
    return seen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traceId, graph, strongEdges]);
  const toggleTrace = (id: string) => setTraceId((cur) => (cur === id ? null : id));
  const visible = useMemo(() => {
    const coll = active && showOnly ? new Set(active.ids) : null;
    let base = coll;
    if (trace) base = coll ? new Set([...trace].filter((x) => coll.has(x))) : trace;
    if (canonicalOnly && !trace) {
      const connected = new Set<string>();
      for (const e of graph?.edges ?? []) {
        if (!strongEdges.includes(e.id)) continue;
        connected.add(e.source);
        connected.add(e.target);
      }
      base = base ? new Set([...base].filter((x) => connected.has(x))) : connected;
    }
    if (filterSet || filterKind) {
      const filtered = new Set(
        (data?.items ?? [])
          .filter((item) => (!filterSet || setMemberIds.has(item.id)) && (!filterKind || item.kind === filterKind))
          .map((item) => item.id),
      );
      base = base ? new Set([...base].filter((id) => filtered.has(id))) : filtered;
    }
    return base;
  }, [active, showOnly, trace, canonicalOnly, graph, strongEdges, filterSet, filterKind, setMemberIds, data]);
  const viewNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        hidden: visible ? !visible.has(n.id) : false,
        data: {
          ...n.data,
          inCollection: active?.ids.includes(n.id) ?? false,
          onToggleCollection: active ? toggleInCollection : undefined,
          tracing: traceId === n.id,
          onTrace: toggleTrace,
        },
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, visible, active, collections, traceId],
  );
  // Strong edges: canonical connections. A theorem has exactly one canonical
  // proof; "used by" and lemma links can be canonical many times over.
  const toggleStrong = (e: Edge) => {
    // Definition edges are always dotted, and lemmas are never canonical
    // results — only theorems and proofs can carry the canonical mark.
    const kindOf = (id: string) => graph?.nodes.find((n) => n.id === id)?.data.item.kind;
    if (kindOf(e.source) === "definition") return;
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
    let list = visible
      ? graph.edges.filter((e) => visible.has(e.source) && visible.has(e.target))
      : graph.edges;
    if (canonicalOnly || trace) list = list.filter((e) => strongEdges.includes(e.id));
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
  }, [graph, visible, strongEdges, canonicalOnly, trace]);

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

  // Restore saved positions and pins; only unsaved layouts run the simulation.
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
      // Drop corrupt saved positions (NaN/Infinity/huge) so one bad entry can't blank the graph.
      saved = Object.fromEntries(
        Object.entries(saved ?? {}).filter(
          ([, v]) =>
            v && Number.isFinite(v.x) && Number.isFinite(v.y) && Math.abs(v.x) < 1e5 && Math.abs(v.y) < 1e5,
        ),
      );
      if (!Array.isArray(cols)) cols = [];
      if (!Array.isArray(strong)) strong = [];
      setCollections(cols);
      setStrongEdges(strong);
      setActiveId("");
      setShowOnly(false);
      pinnedRef.current = new Set(
        Object.entries(saved).filter(([, v]) => v.pinned).map(([k]) => k),
      );
      // Start new visitors close to the shared arrangement, then let the forces
      // settle it once. Saved positions always take precedence and stay frozen.
      initialLayoutRef.current = Object.keys(saved).length === 0;
       setNodes(clearEdgeCorridors(separateSetOutlines(
         graph.nodes.map((n) => {
          const s = saved[n.id];
          const shared = defaultPositions[n.id];
          return {
            ...n,
            position: s ? { x: s.x, y: s.y } : shared ?? n.position,
            data: { ...n.data, pinned: !!s?.pinned, onTogglePin: togglePin },
          };
          }), data?.setElements ?? [], pinnedRef.current), graph.edges, pinnedRef.current));
      vels.current.clear();
      setLayoutVersion((v) => v + 1);
    })();
    return () => {
      cancelled = true;
    };
   }, [graph, data, setNodes, authReady, userId]);

  const saveLayoutRef = useRef(saveLayout);
  saveLayoutRef.current = saveLayout;
  // Run physics once for unsaved layouts, then freeze and save the result.
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
    if (!layoutVersion) return;
    let raf = 0;
    let alpha = initialLayoutRef.current ? 0.35 : 0;
    let frames = 0;
    let active = initialLayoutRef.current;
    reheatRef.current = () => { active = true; frames = 0; alpha = Math.max(alpha, 0.6); };
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      if (active)
        setNodes((ns) => {
          if (!ns.length) return ns;
          alpha *= ALPHA_DECAY;
          let next = forceStep(ns, simEdges, vels.current, pinnedRef.current, simGroups, alpha);
          if (data?.setElements.length) next = separateSetOutlines(next, data.setElements, pinnedRef.current);
          frames++;
          // Stop after the forces cool, even if a dense cluster cannot reach
          // a perfect equilibrium. Manual drags do not wake the simulation.
           if ((next === ns || frames >= 240) && !ns.some((n) => n.dragging)) {
             if (initialLayoutRef.current) {
               next = polishCrossings(next, simEdges, simGroups, pinnedRef.current);
               if (data?.setElements.length) next = separateSetOutlines(next, data.setElements, pinnedRef.current);
               next = clearEdgeCorridors(next, simEdges, pinnedRef.current);
             }
            active = false;
            initialLayoutRef.current = false;
            vels.current.clear();
            clearTimeout(saveTimer);
             saveTimer = setTimeout(() => {
               saveLayoutRef.current(next);
               fitFlowRef.current();
             }, 0);
          }
          return next;
        });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(saveTimer);
      reheatRef.current = () => {};
    };
  }, [setNodes, simEdges, simGroups, data, layoutVersion]);

  const toggleExpand = (id: string) => {
    reheatRef.current();
    setNodes((ns) =>
      ns.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, expanded: !n.data.expanded } } : n,
      ),
    );
  };

  const [flow, setFlow] = useState<ReactFlowInstance | null>(null);
  const clickedNodeRef = useRef(false);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fitFlowRef = useRef<() => void>(() => {});
  fitFlowRef.current = () => {
    if (!clickedNodeRef.current) void flow?.fitView({ padding: 0.2, duration: 800, includeHiddenNodes: true });
  };
  // Re-fit the view once, after the initial layout has had time to settle
  useEffect(() => {
    if (!flow || !graph || !layoutVersion) return;
    const t = setTimeout(() => {
      fitFlowRef.current();
    }, 2500);
    return () => clearTimeout(t);
  }, [flow, graph, layoutVersion]);
  useEffect(() => () => clearTimeout(focusTimerRef.current), []);
  const focusNode = (id: string) => {
    clickedNodeRef.current = true;
    toggleExpand(id);
    clearTimeout(focusTimerRef.current);
    // Wait for the expanded box to be measured and its neighbors to move away.
    focusTimerRef.current = setTimeout(() => {
      const node = flow?.getNode(id);
      if (!node || !flow) return;
      const compact = window.innerWidth < 768;
      const height = nodeHeight(node as Node<CardData>);
      const width = nodeWidth(node as Node<CardData>);
      const availableHeight = window.innerHeight - (compact ? 280 : 100);
      const zoom = Math.max(0.65, Math.min(compact ? 1 : 1.15, availableHeight / height, (window.innerWidth - 48) / width));
      // On small screens the controls occupy the top, so frame the card below them.
      void flow.setCenter(node.position.x + width / 2, node.position.y + height / 2 - (compact ? 115 / zoom : 0), {
        zoom,
        duration: 650,
      });
    }, 350);
  };
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
      <header className="pointer-events-none absolute left-0 top-14 z-10 max-w-full p-3 sm:p-6 md:top-0">
        <h1 className="text-xl font-semibold sm:text-2xl lg:text-3xl tracking-tight text-foreground">MathGraph</h1>
        <p className="mt-1 hidden max-w-sm text-xs text-muted-foreground sm:block lg:text-sm">
          Arrows point from what is used to what it leads to. Drag to pan, scroll to zoom.
        </p>
        <div className="pointer-events-auto relative mt-3 w-[min(18rem,calc(100vw-1.5rem))] lg:w-80">
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
      <div className="absolute left-0 right-0 top-0 z-20 p-3 sm:p-6 md:left-auto">
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <div className="flex w-full items-stretch divide-x divide-border rounded-xl md:w-auto md:min-w-[26rem] lg:min-w-[32rem] border border-border bg-background shadow-sm">
            <ViewMenu
              open={viewOpen}
              setOpen={(v) => {
                setViewOpen(v);
                if (v) { setFiltersOpen(false); setPagesOpen(false); setCollOpen(false); setSubsOpen(false); }
              }}
              savedFlash={savedFlash}
              onSave={() => {
                saveLayout(nodes);
                setSavedFlash(true);
                setTimeout(() => setSavedFlash(false), 1500);
              }}
              onReset={() => {
              if (!graph) return;
              pinnedRef.current.clear();
              vels.current.clear();
              initialLayoutRef.current = true;
              setNodes(graph.nodes.map((n) => ({
                ...n,
                position: defaultPositions[n.id] ?? n.position,
                data: { ...n.data, pinned: false, onTogglePin: togglePin },
              })));
              setLayoutVersion((v) => v + 1);
            }}
              canonicalOnly={canonicalOnly}
              onToggleCanonical={setCanonicalOnly}
              traceActive={!!traceId}
              onClearTrace={() => setTraceId(null)}
            />
            <FiltersMenu
              open={filtersOpen}
              setOpen={(v) => {
                setFiltersOpen(v);
                if (v) { setViewOpen(false); setPagesOpen(false); setCollOpen(false); setSubsOpen(false); }
              }}
              sets={data?.sets ?? []}
              filterSet={filterSet}
              setFilterSet={setFilterSet}
              filterKind={filterKind}
              setFilterKind={setFilterKind}
            />
            <SubmissionsMenu
              userId={userId}
              items={(data?.items ?? []).map((i) => ({ id: i.id, name: i.name, kind: i.kind }))}
              open={subsOpen}
              setOpen={(v) => {
                setSubsOpen(v);
                if (v) { setViewOpen(false); setFiltersOpen(false); setPagesOpen(false); setCollOpen(false); }
              }}
            />
            <PagesMenu
              open={pagesOpen}
              setOpen={(v) => {
                setPagesOpen(v);
                if (v) { setViewOpen(false); setFiltersOpen(false); setCollOpen(false); setSubsOpen(false); }
              }}
            />
            <CollectionsMenu
              collections={collections}
              activeId={activeId}
              activeName={active?.name}
              showOnly={showOnly}
              onSelect={(id) => {
                setActiveId(id);
                if (!id) setShowOnly(false);
                setCollOpen(false);
              }}
              onToggleShowOnly={() => setShowOnly((v) => !v)}
              onNew={() => {
                setCollOpen(false);
                newCollection();
              }}
              onDelete={() => {
                setCollOpen(false);
                deleteCollection();
              }}
              open={collOpen}
              setOpen={(v) => {
                setCollOpen(v);
                if (v) { setViewOpen(false); setFiltersOpen(false); setPagesOpen(false); setSubsOpen(false); }
              }}
            />
          </div>
          {active && (
            <p className="max-w-56 text-right text-[11px] leading-snug text-muted-foreground">
              Click the bookmark on a box to add it to or remove it from “{active.name}”.
            </p>
          )}
        </div>
      </div>
      <div className="pointer-events-auto absolute bottom-0 right-0 z-10 p-6 text-xs text-muted-foreground">
        {userId ? (
          <span>
            Signed in as {fullName ?? email} — your layout is saved to your account.{" "}
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
          className={setOverview ? "set-overview" : ""}
          onlyRenderVisibleElements
          nodes={viewNodes}
          edges={viewEdges}
          onNodesChange={handleNodesChange as OnNodesChange<Node>}
          onNodeDragStop={() => {
            setNodes((current) => {
              setTimeout(() => saveLayoutRef.current(current), 0);
              return current;
            });
          }}
          onNodeClick={(_, node) => focusNode(node.id)}
          onEdgeClick={(_, e) => toggleStrong(e)}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onInit={setFlow}
          onMove={(_, viewport) => setSetOverview(viewport.zoom <= SET_OVERVIEW_ZOOM)}
          fitView
          fitViewOptions={{ padding: 0.2, includeHiddenNodes: true }}
          minZoom={0.06}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
        >
          {data && <SetOutlines nodes={nodes} sets={data.sets} members={data.setElements} visible={visible} />}
          <Background color="var(--border)" gap={24} />
          <Controls showInteractive={false} />
        </ReactFlow>
      )}
      <EdgeMarkers />
      <div className="pointer-events-none absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5 rounded-md border bg-background/90 px-4 py-2 text-xs text-muted-foreground">
        <div className="flex gap-5">
          {[
            ["mg-uses", "used by"],
            ["mg-proof", "proved by"],
          ].map(([m, t]) => (
            <span key={m} className="flex items-center gap-1.5">
              <svg width="34" height="14" className="text-foreground">
                <line x1="2" y1="7" x2="24" y2="7" stroke="currentColor" strokeWidth="1.25" markerEnd={`url(#${m})`} />
              </svg>
              {t}
            </span>
          ))}
        </div>
        <div className="flex gap-5">
          {[
            ["", "canonical"],
            ["5 5", "non-canonical"],
            ["2 4", "definition"],
          ].map(([dash, t]) => (
            <span key={t} className="flex items-center gap-1.5">
              <svg width="34" height="14" className="text-foreground">
                <line
                  x1="2"
                  y1="7"
                  x2="32"
                  y2="7"
                  stroke="currentColor"
                  strokeWidth={dash === "" ? 3 : 1.25}
                  strokeDasharray={dash || undefined}
                />
              </svg>
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
