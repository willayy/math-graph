import React from "react";
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { I18nextProvider, useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";

describe("i18n localization", () => {
  it("translates graph strings without raw key prefixes", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => {
      const element = React.createElement(I18nextProvider, { i18n }, children);
      return element;
    };
    const hookResult = renderHook(() => useTranslation(), { wrapper });
    const { t } = hookResult.result.current;
    const tagline = t("graph.tagline");
    expect(tagline).not.toContain("graph.");
    expect(tagline).toBe(
      "Arrows point from what is used to what it leads to. Drag to pan, scroll to zoom.",
    );
  });
});
