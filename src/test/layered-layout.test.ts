import { describe, expect, it } from "vitest";
import {
  layeredLayout,
  type LayoutNode,
  type LayoutEdge,
  compute_square_bounds_from_corners,
  SET_MARGIN,
  SET_GAP,
} from "@/lib/layered-layout";

const node = (id: string, kind: string, height = 155, set = "book"): LayoutNode => ({ id, kind, height, width: 260, set });
const rank = (set: string | null) => set === "book" ? 0 : 1;

describe("Layered graph layout", () => {
  it("places foundations first and dependents after their deepest dependency", () => {
    const nodes = [node("a", "axiom"), node("d", "definition"), node("t", "theorem"), node("u", "theorem"), node("p", "proof")];
    const edges = [
      { id: "at", source: "a", target: "t" },
      { id: "du", source: "d", target: "u" },
      { id: "tu", source: "t", target: "u" },
      { id: "up", source: "u", target: "p" },
    ];
    const result = layeredLayout(nodes, edges, rank);
    expect(result.positions["a"]?.x).toBe(0);
    expect(result.positions["d"]?.x).toBe(0);
    expect(result.positions["t"]?.x).toBe(460);
    expect(result.positions["u"]?.x).toBe(920);
    expect(result.positions["p"]?.x).toBe(1380);
    expect(layeredLayout(nodes, edges, rank)).toEqual(result);
  });

  it("separates measured boxes and keeps sets in separate bands", () => {
    const nodes = [node("a", "axiom", 450), node("b", "definition", 300), node("c", "axiom", 200, "other")];
    const { positions } = layeredLayout(nodes, [], rank);
    for (let i = 0; i < nodes.length; i++) for (const b of nodes.slice(i + 1)) {
      const a = nodes[i];
      if (!a) throw new Error("Missing test node");
      const p = positions[a.id], q = positions[b.id];
      if (!p || !q) throw new Error("Missing layout position");
      expect(p.y + a.height <= q.y || q.y + b.height <= p.y).toBe(true);
    }
    expect(positions["c"]?.y).toBeGreaterThan(750);
  });

  it("routes long edges between sets without crossings", () => {
    const nodes = [
      node("s1", "axiom"), node("s2", "axiom"), node("mid", "theorem"),
      node("t1", "theorem", 155, "other"), node("t2", "theorem", 155, "other"),
    ];
    const edges = [
      { id: "s1mid", source: "s1", target: "mid" },
      { id: "midt1", source: "mid", target: "t1" },
      { id: "midt2", source: "mid", target: "t2" },
      { id: "s1t2", source: "s1", target: "t2" },
      { id: "s2t1", source: "s2", target: "t1" },
    ];
    const result = layeredLayout(nodes, edges, rank);
    expect(result.crossings).toBe(0);
  });

  it("removes an avoidable crossing within a set", () => {
    const result = layeredLayout(
      [node("a", "axiom"), node("b", "axiom"), node("t", "theorem"), node("u", "theorem")],
      [{ id: "au", source: "a", target: "u" }, { id: "bt", source: "b", target: "t" }], rank,
    );
    expect(result.crossings).toBe(0);
    const a = result.positions["a"], b = result.positions["b"], t = result.positions["t"], u = result.positions["u"];
    if (!a || !b || !t || !u) throw new Error("Missing layout position");
    expect((a.y - b.y) * (u.y - t.y)).toBeGreaterThan(0);
  });

  it("prevents set square bounding boxes from intersecting", () => {
    const nodes: LayoutNode[] = [
      { id: "s1_a", kind: "axiom", height: 155, width: 260, set: "set1" },
      { id: "s1_b", kind: "theorem", height: 155, width: 260, set: "set1" },
      { id: "s2_a", kind: "axiom", height: 155, width: 260, set: "set2" },
      { id: "s2_b", kind: "theorem", height: 155, width: 260, set: "set2" },
    ];
    const edges: LayoutEdge[] = [
      { id: "e1", source: "s1_a", target: "s1_b" },
      { id: "e2", source: "s2_a", target: "s2_b" },
    ];
    const rankFn = (s: string | null) => (s === "set1" ? 0 : 1);
    const result = layeredLayout(nodes, edges, rankFn);
    const set1Nodes = [nodes[0]!, nodes[1]!];
    const set2Nodes = [nodes[2]!, nodes[3]!];
    const corners1 = set1Nodes.flatMap((n) => {
      const pos = result.positions[n.id]!;
      return [
        { x: pos.x - SET_MARGIN, y: pos.y - SET_MARGIN },
        { x: pos.x + n.width + SET_MARGIN, y: pos.y - SET_MARGIN },
        { x: pos.x + n.width + SET_MARGIN, y: pos.y + n.height + SET_MARGIN },
        { x: pos.x - SET_MARGIN, y: pos.y + n.height + SET_MARGIN },
      ];
    });
    const corners2 = set2Nodes.flatMap((n) => {
      const pos = result.positions[n.id]!;
      return [
        { x: pos.x - SET_MARGIN, y: pos.y - SET_MARGIN },
        { x: pos.x + n.width + SET_MARGIN, y: pos.y - SET_MARGIN },
        { x: pos.x + n.width + SET_MARGIN, y: pos.y + n.height + SET_MARGIN },
        { x: pos.x - SET_MARGIN, y: pos.y + n.height + SET_MARGIN },
      ];
    });
    const box1 = compute_square_bounds_from_corners(corners1);
    const box2 = compute_square_bounds_from_corners(corners2);
    expect(box2.top).toBeGreaterThanOrEqual(box1.bottom + SET_GAP);
  });
});