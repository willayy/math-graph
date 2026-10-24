import { describe, expect, it } from "vitest";
import {
  compute_square_bounds_from_corners,
  calculate_offset_for_anchor,
} from "@/routes/index";

describe("graph elements layout", () => {
  it("computes square bounding boxes with equal width and height", () => {
    const corners = [
      { x: 100, y: 50 },
      { x: 300, y: 50 },
      { x: 300, y: 150 },
      { x: 100, y: 150 },
    ];
    const bounds = compute_square_bounds_from_corners(corners);
    const boxWidth = bounds.right - bounds.left;
    const boxHeight = bounds.bottom - bounds.top;

    expect(boxWidth).toBe(boxHeight);
    expect(bounds.size).toBe(200);
    expect(bounds.left).toBe(100);
    expect(bounds.right).toBe(300);
  });

  it("calculates distinct anchor offsets to prevent edge overlap", () => {
    const offsetZero = calculate_offset_for_anchor(0, 1, 155);
    expect(offsetZero).toBe(0);

    const offsetFirstOfTwo = calculate_offset_for_anchor(0, 2, 155);
    const offsetSecondOfTwo = calculate_offset_for_anchor(1, 2, 155);

    expect(offsetFirstOfTwo).toBeLessThan(0);
    expect(offsetSecondOfTwo).toBeGreaterThan(0);
    expect(offsetSecondOfTwo - offsetFirstOfTwo).toBeGreaterThanOrEqual(20);
  });
});
