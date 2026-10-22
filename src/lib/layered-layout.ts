// Deterministic left-to-right layered (Sugiyama-style) graph layout.
// 1. Longest-path layering: foundations in column 0, every dependent one column
//    right of the deepest thing it depends on.
// 2. Long edges are split into dummy nodes so they reserve a lane in each column.
// 3. Crossing reduction: alternating barycenter sweeps + adjacent transposes,
//    keeping the best ordering found. Each set is a horizontal band, so nodes of
//    one set stay contiguous in every column and set outlines never overlap.
// 4. Coordinates: columns use the widest measured box; within a band, nodes
//    are pulled toward the average height of their neighbours while keeping
//    order and minimum gaps (exact isotonic regression).

export type LayoutNode = { id: string; kind: string; width: number; height: number; set: string | null };
export type LayoutEdge = { id: string; source: string; target: string };
export type Point = { x: number; y: number };
export type LayeredResult = {
  positions: Record<string, Point>;
  /** Intermediate lane points for edges spanning more than one column. */
  routes: Record<string, Point[]>;
  crossings: number;
};

const COL_GAP = 200;
const ROW_GAP = 60;
const BAND_GAP = 200; // room for two dashed set outlines and the set label
const DUMMY_H = 24;
const FOUNDATION = new Set(["axiom", "definition"]);

type Slot = { id: string; layer: number; band: number; height: number; width: number; dummy: boolean };

// One full layout pass. Long edges reserve a dummy lane in every column they
// span; dummyBand chooses whether those lanes sit in the source's set band
// (vertical jump at the target end) or the target's band (jump at the start).
function layoutOnce(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  setRank: (set: string | null) => number,
  dummyBand: "source" | "target",
): LayeredResult {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const valid = edges.filter((e) => byId.has(e.source) && byId.has(e.target) && e.source !== e.target);
  const incoming = new Map<string, string[]>();
  for (const e of valid) incoming.set(e.target, [...(incoming.get(e.target) ?? []), e.source]);

  // 1. Longest-path layering (cycle-safe).
  const layer = new Map<string, number>();
  const visit = (id: string, stack: Set<string>): number => {
    const known = layer.get(id);
    if (known !== undefined) return known;
    if (stack.has(id)) return 0;
    stack.add(id);
    const deps = incoming.get(id) ?? [];
    const node = byId.get(id)!;
    const value = deps.length ? 1 + Math.max(...deps.map((d) => visit(d, stack))) : FOUNDATION.has(node.kind) ? 0 : 1;
    stack.delete(id);
    layer.set(id, value);
    return value;
  };
  nodes.forEach((n) => visit(n.id, new Set()));

  // 2. Slots (real + dummy) and unit-length segments.
  const slots = new Map<string, Slot>();
  for (const n of nodes)
    slots.set(n.id, { id: n.id, layer: layer.get(n.id)!, band: setRank(n.set), height: n.height, width: n.width, dummy: false });
  const segments: [string, string][] = [];
  const chains = new Map<string, string[]>();
  for (const e of valid) {
    const a = layer.get(e.source)!, b = layer.get(e.target)!;
    if (b <= a) continue; // back edge from a cycle: drawn but not laid out
    const chain = [e.source];
    for (let l = a + 1; l < b; l++) {
      const id = `__dummy:${e.id}:${l}`;
      slots.set(id, { id, layer: l, band: slots.get(dummyBand === "source" ? e.source : e.target)!.band, height: DUMMY_H, width: 0, dummy: true });
      chain.push(id);
    }
    chain.push(e.target);
    for (let i = 1; i < chain.length; i++) segments.push([chain[i - 1]!, chain[i]!]);
    chains.set(e.id, chain);
  }
  const up = new Map<string, string[]>(), down = new Map<string, string[]>();
  for (const [s, t] of segments) {
    down.set(s, [...(down.get(s) ?? []), t]);
    up.set(t, [...(up.get(t) ?? []), s]);
  }

  const layerCount = Math.max(0, ...[...slots.values()].map((s) => s.layer)) + 1;
  let order: string[][] = Array.from({ length: layerCount }, () => []);
  // Initial order: band, then first-seen DFS order from foundations for locality.
  const seen = new Set<string>();
  const dfs = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    order[slots.get(id)!.layer]!.push(id);
    for (const t of down.get(id) ?? []) dfs(t);
  };
  [...slots.values()].filter((s) => !up.has(s.id)).forEach((s) => dfs(s.id));
  [...slots.keys()].forEach(dfs);
  const byBand = (list: string[]) => list.sort((a, b) => slots.get(a)!.band - slots.get(b)!.band);
  order = order.map((list) => byBand([...list]));

  // 3. Crossing reduction.
  const pos = new Map<string, number>();
  const index = (o: string[][]) => o.forEach((list) => list.forEach((id, i) => pos.set(id, i)));
  const crossingsBetween = (o: string[][], l: number) => {
    index(o);
    const pairs: [number, number][] = [];
    for (const id of o[l]!) for (const t of down.get(id) ?? []) pairs.push([pos.get(id)!, pos.get(t)!]);
    let count = 0;
    for (let i = 0; i < pairs.length; i++)
      for (let j = i + 1; j < pairs.length; j++) {
        const [a1, b1] = pairs[i]!, [a2, b2] = pairs[j]!;
        if ((a1 - a2) * (b1 - b2) < 0) count++;
      }
    return count;
  };
  const totalCrossings = (o: string[][]) => {
    let c = 0;
    for (let l = 0; l < o.length - 1; l++) c += crossingsBetween(o, l);
    return c;
  };
  const sortLayer = (o: string[][], l: number, neighbours: Map<string, string[]>) => {
    index(o);
    const bary = (id: string) => {
      const ns = (neighbours.get(id) ?? []).map((n) => pos.get(n)!);
      return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : pos.get(id)!;
    };
    const values = new Map(o[l]!.map((id) => [id, bary(id)]));
    o[l] = [...o[l]!].sort(
      (a, b) => slots.get(a)!.band - slots.get(b)!.band || values.get(a)! - values.get(b)! || pos.get(a)! - pos.get(b)!,
    );
  };
  const transpose = (o: string[][]) => {
    let improved = true;
    for (let round = 0; round < 6 && improved; round++) {
      improved = false;
      for (let l = 0; l < o.length; l++) {
        for (let i = 0; i < o[l]!.length - 1; i++) {
          const a = o[l]![i]!, b = o[l]![i + 1]!;
          if (slots.get(a)!.band !== slots.get(b)!.band) continue;
          const local = () => (l > 0 ? crossingsBetween(o, l - 1) : 0) + (l < o.length - 1 ? crossingsBetween(o, l) : 0);
          const before = local();
          o[l]![i] = b; o[l]![i + 1] = a;
          if (local() < before) improved = true;
          else { o[l]![i] = a; o[l]![i + 1] = b; }
        }
      }
    }
  };
  let best = order.map((l) => [...l]);
  let bestScore = totalCrossings(best);
  let current = order.map((l) => [...l]);
  for (let pass = 0; pass < 24 && bestScore > 0; pass++) {
    if (pass % 2 === 0) for (let l = 1; l < layerCount; l++) sortLayer(current, l, up);
    else for (let l = layerCount - 2; l >= 0; l--) sortLayer(current, l, down);
    transpose(current);
    const score = totalCrossings(current);
    if (score < bestScore) { bestScore = score; best = current.map((l) => [...l]); }
  }
  order = best;

  // 4. Coordinates. Columns: x from widest real box per layer.
  const colX: number[] = [];
  const colW: number[] = [];
  let x = 0;
  for (let l = 0; l < layerCount; l++) {
    const w = Math.max(0, ...order[l]!.map((id) => slots.get(id)!.width));
    colX.push(x); colW.push(w);
    x += w + COL_GAP;
  }
  // Rows: each band is laid out independently, then stacked vertically.
  const y = new Map<string, number>(); // top edge
  const bands = [...new Set([...slots.values()].map((s) => s.band))].sort((a, b) => a - b);
  let bandTop = 0;
  for (const band of bands) {
    const columns = order.map((list) => list.filter((id) => slots.get(id)!.band === band));
    // Start stacked from 0.
    for (const list of columns) {
      let cursor = 0;
      for (const id of list) { y.set(id, cursor); cursor += slots.get(id)!.height + ROW_GAP; }
    }
    const centre = (id: string) => y.get(id)! + slots.get(id)!.height / 2;
    const place = (list: string[], target: (id: string) => number | null) => {
      if (!list.length) return;
      // Desired tops, then isotonic regression on offset-corrected values (PAV).
      const offsets: number[] = [];
      let acc = 0;
      for (const id of list) { offsets.push(acc); acc += slots.get(id)!.height + ROW_GAP; }
      const desired = list.map((id, i) => {
        const t = target(id);
        return (t === null ? y.get(id)! : t - slots.get(id)!.height / 2) - offsets[i]!;
      });
      const blocks: { sum: number; count: number }[] = [];
      for (const d of desired) {
        blocks.push({ sum: d, count: 1 });
        while (blocks.length > 1) {
          const b = blocks[blocks.length - 1]!, a = blocks[blocks.length - 2]!;
          if (a.sum / a.count <= b.sum / b.count) break;
          blocks.pop();
          a.sum += b.sum; a.count += b.count;
        }
      }
      let i = 0;
      for (const b of blocks) for (let k = 0; k < b.count; k++, i++) y.set(list[i]!, b.sum / b.count + offsets[i]!);
    };
    const avg = (id: string, neighbours: string[]) => {
      const ns = neighbours.filter((n) => slots.get(n)!.band === band);
      return ns.length ? ns.reduce((s, n) => s + centre(n), 0) / ns.length : null;
    };
    for (let iter = 0; iter < 10; iter++) {
      if (iter % 2 === 0) for (let l = 1; l < layerCount; l++) place(columns[l]!, (id) => avg(id, up.get(id) ?? []));
      else for (let l = layerCount - 2; l >= 0; l--) place(columns[l]!, (id) => avg(id, down.get(id) ?? []));
    }
    for (let l = 0; l < layerCount; l++)
      place(columns[l]!, (id) => avg(id, [...(up.get(id) ?? []), ...(down.get(id) ?? [])]));
    const members = columns.flat();
    if (!members.length) continue;
    const top = Math.min(...members.map((id) => y.get(id)!));
    const bottom = Math.max(...members.map((id) => y.get(id)! + slots.get(id)!.height));
    for (const id of members) y.set(id, y.get(id)! - top + bandTop);
    bandTop += bottom - top + BAND_GAP;
  }

  const positions: Record<string, Point> = {};
  for (const n of nodes) {
    const s = slots.get(n.id)!;
    positions[n.id] = { x: colX[s.layer]! + (colW[s.layer]! - n.width) / 2, y: y.get(n.id)! };
  }
  const routes: Record<string, Point[]> = {};
  for (const [edgeId, chain] of chains) {
    if (chain.length <= 2) continue;
    routes[edgeId] = chain.slice(1, -1).flatMap((id) => {
      const s = slots.get(id)!;
      const cy = y.get(id)! + s.height / 2;
      return [{ x: colX[s.layer]!, y: cy }, { x: colX[s.layer]! + colW[s.layer]!, y: cy }];
    });
  }
  return { positions, routes, crossings: bestScore };
}

// Deterministic left-to-right layout. Runs both dummy-lane routings and keeps
// the one with fewer drawn crossings (ties keep the source-band routing), so
// long edges between sets pick the side that tangles less.
export function layeredLayout(nodes: LayoutNode[], edges: LayoutEdge[], setRank: (set: string | null) => number): LayeredResult {
  const fromSource = layoutOnce(nodes, edges, setRank, "source");
  if (fromSource.crossings === 0) return fromSource;
  const fromTarget = layoutOnce(nodes, edges, setRank, "target");
  return fromTarget.crossings < fromSource.crossings ? fromTarget : fromSource;
}
