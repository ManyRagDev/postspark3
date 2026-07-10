import { describe, expect, it } from "vitest";
import {
  extractShadowGraphEvents,
  calculateShadowGraphMetrics,
  getEmptyShadowGraphMetrics,
} from "./db";

describe("database shadow graph metrics", () => {
  describe("extractShadowGraphEvents", () => {
    it("returns empty array for non-array input", () => {
      expect(extractShadowGraphEvents(null)).toEqual([]);
      expect(extractShadowGraphEvents(undefined)).toEqual([]);
      expect(extractShadowGraphEvents("not an array")).toEqual([]);
      expect(extractShadowGraphEvents({})).toEqual([]);
    });

    it("filters only generation_graph_shadow events", () => {
      const events = [
        { stage: "other_stage", status: "completed" },
        { stage: "generation_graph_shadow", status: "completed" },
        { stage: "generation_graph_shadow", status: "rejected" },
        { stage: "another_stage", status: "failed" },
      ];

      const result = extractShadowGraphEvents(events);
      expect(result).toHaveLength(2);
      expect(result.every((e) => e.stage === "generation_graph_shadow")).toBe(true);
    });

    it("filters out non-object events", () => {
      const events = [
        { stage: "generation_graph_shadow", status: "completed" },
        null,
        "string",
        [],
        123,
        { stage: "generation_graph_shadow", status: "rejected" },
      ];

      const result = extractShadowGraphEvents(events);
      expect(result).toHaveLength(2);
    });
  });

  describe("calculateShadowGraphMetrics", () => {
    it("returns empty metrics for no events", () => {
      const metrics = calculateShadowGraphMetrics([]);

      expect(metrics).toEqual({
        totalShadowRuns: 0,
        shadowCompletedRuns: 0,
        shadowRejectedRuns: 0,
        shadowFailedRuns: 0,
        shadowValidationErrors: 0,
        shadowCopyErrors: 0,
        shadowSectionsErrors: 0,
        shadowVisualFitErrors: 0,
        shadowGuardsAppliedRate: 0,
        shadowDivergenceRate: 0,
      });
    });

    it("calculates metrics from completed shadow runs", () => {
      const events = [
        {
          stage: "generation_graph_shadow",
          status: "completed",
          data: {
            validationErrors: [],
            copyValidationErrors: [],
            sectionsValidationErrors: [],
            visualFitErrors: [],
            copyGuardsApplied: false,
          },
        },
      ];

      const metrics = calculateShadowGraphMetrics(events);

      expect(metrics.totalShadowRuns).toBe(1);
      expect(metrics.shadowCompletedRuns).toBe(1);
      expect(metrics.shadowRejectedRuns).toBe(0);
      expect(metrics.shadowFailedRuns).toBe(0);
      expect(metrics.shadowDivergenceRate).toBe(0);
    });

    it("calculates metrics from rejected shadow runs", () => {
      const events = [
        {
          stage: "generation_graph_shadow",
          status: "rejected",
          data: {
            validationErrors: ["schema error"],
            copyValidationErrors: ["missing headline"],
            sectionsValidationErrors: ["invalid sections"],
            visualFitErrors: ["overlap"],
            copyGuardsApplied: true,
          },
        },
      ];

      const metrics = calculateShadowGraphMetrics(events);

      expect(metrics.totalShadowRuns).toBe(1);
      expect(metrics.shadowCompletedRuns).toBe(0);
      expect(metrics.shadowRejectedRuns).toBe(1);
      expect(metrics.shadowValidationErrors).toBe(1);
      expect(metrics.shadowCopyErrors).toBe(1);
      expect(metrics.shadowSectionsErrors).toBe(1);
      expect(metrics.shadowVisualFitErrors).toBe(1);
      expect(metrics.shadowGuardsAppliedRate).toBe(1);
      expect(metrics.shadowDivergenceRate).toBe(1);
    });

    it("calculates guards applied rate correctly", () => {
      const events = [
        {
          stage: "generation_graph_shadow",
          status: "completed",
          data: { copyGuardsApplied: true },
        },
        {
          stage: "generation_graph_shadow",
          status: "completed",
          data: { copyGuardsApplied: true },
        },
        {
          stage: "generation_graph_shadow",
          status: "completed",
          data: { copyGuardsApplied: false },
        },
      ];

      const metrics = calculateShadowGraphMetrics(events);

      expect(metrics.totalShadowRuns).toBe(3);
      expect(metrics.shadowGuardsAppliedRate).toBeCloseTo(2 / 3);
    });

    it("identifies divergence from errors even with completed status", () => {
      const events = [
        {
          stage: "generation_graph_shadow",
          status: "completed",
          data: {
            validationErrors: ["minor issue"],
            copyValidationErrors: [],
            sectionsValidationErrors: [],
            visualFitErrors: [],
          },
        },
      ];

      const metrics = calculateShadowGraphMetrics(events);

      expect(metrics.shadowDivergenceRate).toBe(1);
    });

    it("aggregates errors across multiple events", () => {
      const events = [
        {
          stage: "generation_graph_shadow",
          status: "rejected",
          data: {
            validationErrors: ["error1", "error2"],
            copyValidationErrors: ["copy1"],
            sectionsValidationErrors: ["sections1", "sections2"],
            visualFitErrors: [],
          },
        },
        {
          stage: "generation_graph_shadow",
          status: "rejected",
          data: {
            validationErrors: ["error3"],
            copyValidationErrors: [],
            sectionsValidationErrors: [],
            visualFitErrors: ["fit1"],
          },
        },
      ];

      const metrics = calculateShadowGraphMetrics(events);

      expect(metrics.shadowValidationErrors).toBe(3);
      expect(metrics.shadowCopyErrors).toBe(1);
      expect(metrics.shadowSectionsErrors).toBe(2);
      expect(metrics.shadowVisualFitErrors).toBe(1);
    });
  });

  describe("getEmptyShadowGraphMetrics", () => {
    it("returns zero metrics for shadow graph", () => {
      const metrics = getEmptyShadowGraphMetrics();

      expect(metrics).toEqual({
        totalShadowRuns: 0,
        shadowCompletedRuns: 0,
        shadowRejectedRuns: 0,
        shadowFailedRuns: 0,
        shadowValidationErrors: 0,
        shadowCopyErrors: 0,
        shadowSectionsErrors: 0,
        shadowVisualFitErrors: 0,
        shadowGuardsAppliedRate: 0,
        shadowDivergenceRate: 0,
      });
    });
  });
});
