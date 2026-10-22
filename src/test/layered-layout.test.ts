import { describe, expect, it } from "vitest";
import { layeredLayout, type LayoutNode } from "@/lib/layered-layout";

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
});