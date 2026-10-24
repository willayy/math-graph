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
import { useTranslation } from "react-i18next";
import { layeredLayout, type LayeredResult } from "@/lib/layered-layout";

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
  const { t } = useTranslation();
  const {
    item,
    expanded,
    relations,
    pinned,
    onTogglePin,
    inCollection,
    onToggleCollection,
    tracing,
    onTrace,
  } = data;
  const dateText = item.date ?? t("common.unknown");
  const creatorText = item.creator ?? t("common.unknown");
  const meta = [dateText, creatorText].join(" · ");
  const style = KIND_STYLES[item.kind];
  const zoom = useStore((st) => st.transform[2]);
  const detailOpacity = clamp01((zoom - 0.32) / 0.2);
  const collectionTitle = inCollection
    ? t("graph.removeFromCollection")
    : t("graph.addToCollection");
  const pinTitle = pinned ? t("graph.unpin") : t("graph.pin");

  return (
    <div
      className={`relative cursor-pointer rounded-md border border-foreground/80 border-l-4 bg-background p-3 text-left shadow-sm transition-shadow hover:shadow-md ${style.border}`}
      style={{ width: expanded ? 340 : NODE_W, minHeight: NODE_H }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!opacity-0 !pointer-events-none"
        isConnectable={false}
      />
      <div
        className="pointer-events-none absolute inset-3 flex items-center justify-center text-center transition-opacity duration-200"
        style={{ opacity: 1 - detailOpacity }}
        aria-hidden={detailOpacity === 1}
      >
        <span className="line-clamp-3 text-3xl font-semibold leading-tight text-foreground">
          {item.name}
        </span>
      </div>
      <div
        className="transition-opacity duration-200"
        style={{ opacity: detailOpacity, pointerEvents: detailOpacity < 0.85 ? "none" : "auto" }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={
              `flex items-center gap-1.5 text-[10px] font-semibold uppercase ` +
              `tracking-widest ${style.label}`
            }
          >
            <span className={`inline-block h-2 w-2 rounded-full ${style.chip}`} />
            {item.kind}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[10px] text-muted-foreground">{meta}</span>
            {onToggleCollection && (
              <button
                title={collectionTitle}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleCollection(item.id);
                }}
                className={`nodrag rounded p-0.5 transition-colors ${
                  inCollection
                    ? "text-foreground"
                    : "text-muted-foreground/40 hover:text-muted-foreground"
                }`}
              >
                <Bookmark className="h-3 w-3" fill={inCollection ? "currentColor" : "none"} />
              </button>
            )}
            <button
              title={pinTitle}
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
        <h3 className="mt-1 text-sm font-semibold leading-tight text-foreground">{item.name}</h3>
        <p
          className={`mt-1 text-xs leading-snug text-foreground/75 ${
            expanded ? "" : "line-clamp-3"
          }`}
        >
          {zoom > 0.32 ? <RichText text={item.statement} /> : item.statement.replace(/\$/g, "")}
        </p>
        {item.citation && (
          <p
            className={
              `mt-1.5 border-t border-border pt-1.5 text-[10px] italic text-muted-foreground ${
                expanded ? "" : "line-clamp-1"
              }`
            }
          >
            {item.citation}
          </p>
        )}
        {expanded && (
          <dl className="mt-2 space-y-1 border-t border-border pt-2 text-[10px]">
            <div className="flex gap-2">
              <dt className="w-14 shrink-0 font-semibold uppercase text-muted-foreground">
                {t("common.type")}
              </dt>
              <dd className="capitalize text-foreground/80">{item.kind}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-14 shrink-0 font-semibold uppercase text-muted-foreground">
                {t("common.date")}
              </dt>
              <dd className="text-foreground/80">{item.date ?? t("common.unknown")}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-14 shrink-0 font-semibold uppercase text-muted-foreground">
                {t("common.creator")}
              </dt>
              <dd className="text-foreground/80">{item.creator ?? t("common.unknown")}</dd>
            </div>
            {item.citation && (
              <div className="flex gap-2">
                <dt className="w-14 shrink-0 font-semibold uppercase text-muted-foreground">
                  {t("common.source")}
                </dt>
                <dd className="italic text-foreground/80">{item.citation}</dd>
              </div>
            )}
          </dl>
        )}
        {expanded && relations && relations.length > 0 && (
          <div className="mt-2 space-y-1.5 border-t border-border pt-2">
            {relations.map((g) => (
              <div key={g.label}>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">
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
            className={
              "nodrag mt-2 w-full rounded border border-border px-2 py-1 text-[11px] hover:bg-muted"
            }
          >
            {tracing ? t("graph.showEverything") : t("graph.showCanonicalTrace")}
          </button>
        )}
        {expanded && (
          <p className="mt-1.5 text-[10px] text-muted-foreground">{t("graph.clickToCollapse")}</p>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!opacity-0 !pointer-events-none"
        isConnectable={false}
      />
    </div>
  );
}

const nodeTypes = { card: Card };

const SET_OVERVIEW_ZOOM = 0.12;
const SET_MARGIN = 55;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const nodeWidth = (node: Node<CardData>) => node.measured?.width ?? (node.data.expanded ? 340 : NODE_W);
const nodeHeight = (node: Node<CardData>) => node.measured?.height ?? NODE_H;


function compute_square_bounds_from_corners(
  corners: { x: number; y: number }[],
) {
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const size = Math.max(spanX, spanY);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const half = size / 2;
  const left = centerX - half;
  const right = centerX + half;
  const top = centerY - half;
  const bottom = centerY + half;
  return { left, right, top, bottom, size };
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
    const bounds = compute_square_bounds_from_corners(corners);
    return { ...set, ...bounds };
  }).filter((outline): outline is NonNullable<typeof outline> => outline !== null), [sets, members, visible, nodeById]);

  return (
    <ViewportPortal>
      {outlines.map((set) => (
        <div key={set.id} className="pointer-events-none absolute left-0 top-0">
          <svg className="absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden="true">
            <rect
              x={set.left}
              y={set.top}
              width={set.size}
              height={set.size}
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

function calculate_offset_for_anchor(
  index: number,
  count: number,
  dimension: number,
): number {
  if (count <= 1) {
    return 0;
  }
  const maxSpan = dimension * 0.7;
  const step = Math.min(24, maxSpan / (count - 1));
  const centeredIndex = index - (count - 1) / 2;
  return centeredIndex * step;
}

function group_edges_by_endpoint(
  edges: Edge[],
  endpointKey: "source" | "target",
): Map<string, Edge[]> {
  const grouped = new Map<string, Edge[]>();
  edges.forEach((edge) => {
    const id = edge[endpointKey];
    const existing = grouped.get(id) ?? [];
    existing.push(edge);
    grouped.set(id, existing);
  });
  return grouped;
}

function sort_edges_by_peer_coordinate(
  edges: Edge[],
  peerKey: "source" | "target",
  nodePositions: Map<string, { y: number }>,
): Edge[] {
  const comparator = (a: Edge, b: Edge) => {
    const posA = nodePositions.get(a[peerKey])?.y ?? 0;
    const posB = nodePositions.get(b[peerKey])?.y ?? 0;
    return posA - posB;
  };
  return [...edges].sort(comparator);
}

function record_indices_for_edge_group(
  sortedGroup: Edge[],
  metaMap: Map<string, { index: number; count: number }>,
): void {
  const total = sortedGroup.length;
  sortedGroup.forEach((edge, index) => {
    metaMap.set(edge.id, { index, count: total });
  });
}

// Floating edge. When the layered layout has routed this edge through dummy
// lanes (and both endpoints are still where the layout put them), the line
// follows those lanes: horizontal runs with smooth vertical connectors, so
// every edge flows strictly left to right and never cuts through a column.
// Otherwise it falls back to a direct curve between the two boxes.
function FloatingEdge({ id, source, target, label, markerEnd, markerStart, style, data }: EdgeProps) {
  const sn = useInternalNode(source);
  const tn = useInternalNode(target);
  if (!sn || !tn) return null;
  const w = (n: typeof sn | typeof tn) => n.measured?.width ?? NODE_W;
  const h = (n: typeof sn | typeof tn) => n.measured?.height ?? NODE_H;
  const sc = { x: sn.internals.positionAbsolute.x + w(sn) / 2, y: sn.internals.positionAbsolute.y + h(sn) / 2 };
  const tc = { x: tn.internals.positionAbsolute.x + w(tn) / 2, y: tn.internals.positionAbsolute.y + h(tn) / 2 };
  type RouteData = { route?: { x: number; y: number }[]; routeFrom?: { x: number; y: number }; routeTo?: { x: number; y: number } };
  const rd = (data ?? {}) as RouteData;
  const near = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y) < 2;
  // Positions (top-left corners) must still match the layout; dragging a box
  // releases the edge back to a direct curve.
  const routed =
    !!rd.route?.length && !!rd.routeFrom && !!rd.routeTo &&
    near(rd.routeFrom, sn.internals.positionAbsolute) && near(rd.routeTo, tn.internals.positionAbsolute);

  let path: string;
  let labelX: number, labelY: number;
  if (routed) {
    const pts = [{ x: sc.x + w(sn) / 2, y: sc.y }, ...rd.route!, { x: tc.x - w(tn) / 2, y: tc.y }];
    const seg = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.abs(b.y - a.y) < 0.5
        ? `L ${b.x} ${b.y}`
        : `C ${a.x + (b.x - a.x) / 2} ${a.y}, ${b.x - (b.x - a.x) / 2} ${b.y}, ${b.x} ${b.y}`;
    path = `M ${pts[0]!.x} ${pts[0]!.y} ` + pts.slice(1).map((p, i) => seg(pts[i]!, p)).join(" ");
    const mid = pts[Math.floor((pts.length - 1) / 2)]!;
    [labelX, labelY] = [mid.x, mid.y];
  } else {
    const dx = tc.x - sc.x;
    const dy = tc.y - sc.y;
    // Attach only at the middle of a box side: left/right when the boxes are
    // side by side, top/bottom when they are stacked.
    const horiz = Math.abs(dx) >= Math.abs(dy);
    const p1 = horiz
      ? { x: sc.x + (dx >= 0 ? w(sn) / 2 : -w(sn) / 2), y: sc.y }
      : { x: sc.x, y: sc.y + (dy >= 0 ? h(sn) / 2 : -h(sn) / 2) };
    const p2 = horiz
      ? { x: tc.x + (dx >= 0 ? -w(tn) / 2 : w(tn) / 2), y: tc.y }
      : { x: tc.x, y: tc.y + (dy >= 0 ? -h(tn) / 2 : h(tn) / 2) };
    const [p, lx, ly] = getBezierPath({
      sourceX: p1.x,
      sourceY: p1.y,
      sourcePosition: horiz ? (dx >= 0 ? Position.Right : Position.Left) : dy >= 0 ? Position.Bottom : Position.Top,
      targetX: p2.x,
      targetY: p2.y,
      targetPosition: horiz ? (dx >= 0 ? Position.Left : Position.Right) : dy >= 0 ? Position.Top : Position.Bottom,
    });
    path = p;
    labelX = lx;
    labelY = ly;
  }
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
  const { t, i18n } = useTranslation();
  const item =
    "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted";
  return (
    <div className="relative flex flex-1">
      <button onClick={() => setOpen(!open)} className={`${segmentBtn} rounded-l-xl`}>
        {t("graph.viewMenu")} <Chevron open={open} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-md border border-border bg-background shadow-md">
            <p className="border-b border-border px-3 pb-1.5 pt-2.5 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
              {t("graph.viewLayout")}
            </p>
            <div className="py-1">
              <button
                onClick={() => {
                  props.onSave();
                  setOpen(false);
                }}
                className={item}
              >
                {props.savedFlash ? t("graph.layoutSaved") : t("graph.saveLayout")}
              </button>
              <button onClick={props.onReset} className={item}>
                {t("graph.resetPositions")}
              </button>
              <label className={`${item} cursor-pointer`}>
                {t("graph.canonicalOnly")}
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
                  {t("graph.clearTrace")}
                </button>
              )}
            </div>
            <div
              className="flex items-center justify-between border-t border-border px-3 py-2 text-xs"
            >
              <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                {t("graph.language")}
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => void i18n.changeLanguage("en")}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                    i18n.language.startsWith("en")
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                >
                  {t("graph.langEn")}
                </button>
                <button
                  type="button"
                  onClick={() => void i18n.changeLanguage("sv")}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                    i18n.language.startsWith("sv")
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                >
                  {t("graph.langSv")}
                </button>
              </div>
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
  const { t } = useTranslation();
  return (
    <div className="relative flex flex-1">
      <button
        onClick={() => props.setOpen(!props.open)}
        className={segmentBtn}
        aria-expanded={props.open}
      >
        {t("graph.filtersMenu")} <Chevron open={props.open} />
      </button>
      {props.open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => props.setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-60 space-y-2 rounded-md border border-border bg-background p-3 shadow-md">
            <label
              htmlFor="set-filter"
              className="block text-[10px] font-semibold uppercase text-muted-foreground"
            >
              {t("graph.setLabel")}
            </label>
            <select
              id="set-filter"
              value={props.filterSet}
              onChange={(e) => props.setFilterSet(e.target.value)}
              className="w-full bg-background text-xs text-foreground outline-none"
            >
              <option value="">{t("graph.allSets")}</option>
              {props.sets.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.name}
                </option>
              ))}
            </select>
            <label
              htmlFor="kind-filter"
              className="block text-[10px] font-semibold uppercase text-muted-foreground"
            >
              {t("graph.nodeTypeLabel")}
            </label>
            <select
              id="kind-filter"
              value={props.filterKind}
              onChange={(e) => props.setFilterKind(e.target.value)}
              className="w-full bg-background text-xs text-foreground outline-none"
            >
              <option value="">{t("graph.allTypes")}</option>
              {(["axiom", "definition", "conjecture", "theorem", "proof"] as const).map(
                (kind) => (
                  <option key={kind} value={kind}>
                    {kind.replace(/^./, (letter) => letter.toUpperCase())}
                  </option>
                ),
              )}
            </select>
          </div>
        </>
      )}
    </div>
  );
}

// Pages dropdown: links to the change history and about pages.
function PagesMenu({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <div className="relative flex flex-1">
      <button onClick={() => setOpen(!open)} className={segmentBtn}>
        {t("graph.pagesMenu")} <Chevron open={open} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-md border border-border bg-background shadow-md">
            <div className="py-1">
              <Link
                to="/history"
                className="block px-3 py-1.5 text-xs hover:bg-muted"
                onClick={() => setOpen(false)}
              >
                {t("graph.historyLink")}
              </Link>
              <Link
                to="/about"
                className="block px-3 py-1.5 text-xs hover:bg-muted"
                onClick={() => setOpen(false)}
              >
                {t("graph.aboutLink")}
              </Link>
              <Link
                to="/verify"
                className="block px-3 py-1.5 text-xs hover:bg-muted"
                onClick={() => setOpen(false)}
              >
                {t("graph.verifyLink")}
              </Link>
              <Link
                to="/admin"
                className="block px-3 py-1.5 text-xs hover:bg-muted"
                onClick={() => setOpen(false)}
              >
                {t("graph.adminLink")}
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
  const { t } = useTranslation();
  return (
    <div className="relative flex flex-1">
      <button onClick={() => setOpen(!open)} className={`${segmentBtn} rounded-r-xl`}>
        <span className="max-w-24 truncate">{activeName ?? t("graph.collectionsMenu")}</span>
        <Chevron open={open} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-full min-w-52 overflow-hidden rounded-md border border-border bg-background shadow-md">
          <p className="border-b border-border px-3 pb-1.5 pt-2.5 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
            {t("graph.collectionsMenu")}
          </p>
          <div className="max-h-48 overflow-y-auto py-1">
            <button
              onClick={() => props.onSelect("")}
              className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-muted"
            >
              <span className={activeId ? "text-muted-foreground" : "font-medium"}>
                {t("graph.noCollection")}
              </span>
              {!activeId && <CheckIcon />}
            </button>
            {collections.map((c) => (
              <button
                key={c.id}
                onClick={() => props.onSelect(c.id)}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted"
              >
                <span className={`truncate ${c.id === activeId ? "font-medium" : ""}`}>
                  {c.name}
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
                  {c.ids.length}
                  {c.id === activeId && <CheckIcon />}
                </span>
              </button>
            ))}
            {collections.length === 0 && (
              <p className="px-3 py-1.5 text-xs text-muted-foreground">
                {t("graph.noCollectionsYet")}
              </p>
            )}
          </div>
          <div className="border-t border-border py-1">
            <button
              onClick={props.onNew}
              className="w-full px-3 py-1.5 text-left text-xs hover:bg-muted"
            >
              {t("graph.newCollection")}
            </button>
            {activeId && (
              <>
                <button
                  onClick={props.onToggleShowOnly}
                  className="w-full px-3 py-1.5 text-left text-xs hover:bg-muted"
                >
                  {showOnly ? t("graph.showAllNodes") : t("graph.showOnlyCollection")}
                </button>
                <button
                  onClick={props.onDelete}
                  className="w-full px-3 py-1.5 text-left text-xs text-destructive hover:bg-muted"
                >
                  {t("graph.deleteCollection")}
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
  const nodes: Node<CardData>[] = items.map((item) => ({
    id: item.id,
    type: "card",
    position: { x: 0, y: 0 }, // placed by the layered layout
    data: { item, relations: toGroups(relMap.get(item.id)) },
  }));

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

const LAYOUT_KEY = "mathgraph-layout-v1";
const COLLECTIONS_KEY = "mathgraph-collections";
const STRONG_KEY = "mathgraph-strong-edges";

function Index() {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { data, isLoading, error } = useQuery({ queryKey: ["graph"], queryFn: fetchGraph });
  const graph = useMemo(
    () => (data ? buildGraph(data.items, data.uses, data.sets, data.setElements) : null),
    [data],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<CardData>>([] as Node<CardData>[]);
  // Layered layout input: each card's primary set is its most specific (smallest)
  // set; sets become horizontal bands, largest first.
  const computeLayout = (ns: Node<CardData>[]) => {
    if (!graph || !data) return null;
    const size = new Map<string, number>();
    for (const se of data.setElements) size.set(se.set_id, (size.get(se.set_id) ?? 0) + 1);
    const primary = new Map<string, string>();
    for (const se of data.setElements) {
      const current = primary.get(se.element_id);
      if (!current || size.get(se.set_id)! < size.get(current)!) primary.set(se.element_id, se.set_id);
    }
    const name = new Map(data.sets.map((set) => [set.id, set.name]));
    const ranked = [...size.keys()].sort((a, b) => size.get(b)! - size.get(a)! || (name.get(a) ?? "").localeCompare(name.get(b) ?? ""));
    return layeredLayout(
      ns.map((n) => ({ id: n.id, kind: n.data.item.kind, width: nodeWidth(n), height: nodeHeight(n), set: primary.get(n.id) ?? null })),
      graph.edges,
      (set) => (set ? ranked.indexOf(set) : ranked.length),
    );
  };
  const [layoutVersion, setLayoutVersion] = useState(0);
  // True while positions should be (re)computed by the layered layout once
  // every card has been measured: new visitors and Reset positions.
  const needsLayoutRef = useRef(false);
  const [layout, setLayout] = useState<LayeredResult | null>(null);
  const handleNodesChange = onNodesChange;
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
        const promptText = t("graph.realNamePrompt");
        const entered = window.prompt(promptText);
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
    const promptMsg = t("graph.collectionPrompt");
    const entered = window.prompt(promptMsg);
    const name = entered?.trim();
    if (!name) return;
    const c = { id: crypto.randomUUID(), name, ids: [] };
    updateCollections([...collections, c]);
    setActiveId(c.id);
  };
  const deleteCollection = () => {
    if (!active) return;
    const confirmMsg = t("graph.deleteCollectionConfirm", { name: active.name });
    const confirmed = window.confirm(confirmMsg);
    if (!confirmed) return;
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
    // Lane points from the layered layout; the edge only follows them while
    // both endpoints are still where the layout put them.
    list = list.map((e) => ({
      ...e,
      data: { ...e.data, route: layout?.routes[e.id], routeFrom: layout?.positions[e.source], routeTo: layout?.positions[e.target] },
    }));
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
      const canonicalTag = t("graph.legendCanonical");
      const strongLabel = `${e.label} (${canonicalTag})`;
      return {
        ...e,
        label: strong ? strongLabel : e.label,
        style: {
          stroke: "var(--foreground)",
          strokeWidth: strong ? 3 : 1.25,
          strokeDasharray: strong ? undefined : "5 5",
          cursor: "pointer",
        },
      };
    });
  }, [graph, visible, strongEdges, canonicalOnly, trace, layout]);

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

  // Restore saved positions and pins; compute layered positions for unsaved layouts.
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
      // Saved positions always take precedence; everyone else gets the
      // deterministic layered layout (refined once cards are measured).
      needsLayoutRef.current = Object.keys(saved).length === 0;
      const initial = computeLayout(graph.nodes);
      setLayout(initial);
      setNodes(graph.nodes.map((n) => {
        const s = saved[n.id];
        return {
          ...n,
          position: s ? { x: s.x, y: s.y } : initial?.positions[n.id] ?? n.position,
          data: { ...n.data, pinned: !!s?.pinned, onTogglePin: togglePin },
        };
      }));
      setLayoutVersion((v) => v + 1);
    })();
    return () => {
      cancelled = true;
    };
   }, [graph, data, setNodes, authReady, userId]);

  const saveLayoutRef = useRef(saveLayout);
  saveLayoutRef.current = saveLayout;
  // Once every card has real measured dimensions, place them with the layered
  // layout, save the result and fit the view. Nothing moves afterwards except
  // by dragging.
  useEffect(() => {
    if (!needsLayoutRef.current || !nodes.length) return;
    if (!nodes.every((n) => n.measured?.width && n.measured?.height)) return;
    const result = computeLayout(nodes);
    if (!result) return;
    needsLayoutRef.current = false;
    setLayout(result);
    const next = nodes.map((n) => ({ ...n, position: result.positions[n.id] ?? n.position }));
    setNodes(next);
    setTimeout(() => {
      saveLayoutRef.current(next);
      fitFlowRef.current();
    }, 0);
  }, [nodes]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleExpand = (id: string) => {
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
  // Re-fit once after the initial cards have been measured.
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
    // Wait for the expanded box to be measured.
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
          {t("graph.tagline")}
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
            placeholder={t("graph.searchPlaceholder")}
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
              needsLayoutRef.current = true;
              setNodes((ns) => ns.map((n) => ({ ...n, data: { ...n.data, pinned: false, onTogglePin: togglePin } })));
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
              {t("graph.collectionHint", { name: active.name })}
            </p>
          )}
        </div>
      </div>
      <div className="pointer-events-auto absolute bottom-0 right-0 z-10 p-6 text-xs text-muted-foreground">
        {userId ? (
          <span>
            {t("graph.signedInAs", { name: fullName ?? email })}{" "}
            <button onClick={() => supabase.auth.signOut()} className="underline">
              {t("graph.signOut")}
            </button>
          </span>
        ) : (
          <span>
            <Link to="/auth" className="underline">
              {t("graph.signInLink")}
            </Link>{" "}
            {t("graph.signInPromptPrefix")}
          </span>
        )}
      </div>
      {(isLoading || !mounted) && (
        <p className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
          {t("common.loading")}
        </p>
      )}
      {error && (
        <p className="absolute inset-0 grid place-items-center text-sm text-destructive">
          {t("graph.loadError")}
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
            ["mg-uses", t("graph.legendUsedBy")],
            ["mg-proof", t("graph.legendProvedBy")],
          ].map(([m, text]) => (
            <span key={m} className="flex items-center gap-1.5">
              <svg width="34" height="14" className="text-foreground">
                <line
                  x1="2"
                  y1="7"
                  x2="24"
                  y2="7"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  markerEnd={`url(#${m})`}
                />
              </svg>
              {text}
            </span>
          ))}
        </div>
        <div className="flex gap-5">
          {[
            ["", t("graph.legendCanonical")],
            ["5 5", t("graph.legendNonCanonical")],
            ["2 4", t("graph.legendDefinition")],
          ].map(([dash, text]) => (
            <span key={text} className="flex items-center gap-1.5">
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
              {text}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
