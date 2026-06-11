import { describe, expect, it } from "vitest";
import { buildAnalyticsSummary, buildDayTimeline } from "./analytics";
import type { AppSnapshot } from "../types";

const baseSnapshot: AppSnapshot = {
  labels: [
    {
      id: "status-completed",
      type: "session_status",
      name: "完成",
      color: "#2f855a",
      is_default: true,
      is_active: true,
      sort_order: 10,
      created_at: "2026-06-11T00:00:00.000Z",
      updated_at: "2026-06-11T00:00:00.000Z",
    },
    {
      id: "product-note",
      type: "product",
      name: "笔记",
      color: "#2b6cb0",
      is_default: true,
      is_active: true,
      sort_order: 10,
      created_at: "2026-06-11T00:00:00.000Z",
      updated_at: "2026-06-11T00:00:00.000Z",
    },
    {
      id: "blocker-none",
      type: "blocker",
      name: "无",
      color: "#2f855a",
      is_default: true,
      is_active: true,
      sort_order: 10,
      created_at: "2026-06-11T00:00:00.000Z",
      updated_at: "2026-06-11T00:00:00.000Z",
    },
  ],
  arrivalSessions: [
    {
      id: "arrival-1",
      local_date: "2026-06-11",
      arrived_at: "2026-06-11T00:00:00.000Z",
      created_at: "2026-06-11T00:00:00.000Z",
      updated_at: "2026-06-11T00:00:00.000Z",
    },
  ],
  focusSessions: [
    {
      id: "focus-1",
      arrival_session_id: "arrival-1",
      local_date: "2026-06-11",
      planned_duration_minutes: 25,
      actual_duration_minutes: 25,
      started_at: "2026-06-11T00:30:00.000Z",
      paused_total_seconds: 0,
      completed_at: "2026-06-11T00:55:00.000Z",
      state: "reviewed",
      earned_break_minutes: 5,
      created_at: "2026-06-11T00:30:00.000Z",
      updated_at: "2026-06-11T00:55:00.000Z",
    },
  ],
  sessionReviews: [
    {
      id: "review-1",
      focus_session_id: "focus-1",
      status_label_id: "status-completed",
      attention_switch_count: 2,
      product_note: "整理了一页笔记",
      blocker_note: "没有明显阻塞",
      created_at: "2026-06-11T00:56:00.000Z",
      updated_at: "2026-06-11T00:56:00.000Z",
    },
  ],
  sessionReviewLabels: [
    {
      id: "review-label-1",
      review_id: "review-1",
      label_id: "product-note",
      label_type: "product",
      created_at: "2026-06-11T00:56:00.000Z",
    },
    {
      id: "review-label-2",
      review_id: "review-1",
      label_id: "blocker-none",
      label_type: "blocker",
      created_at: "2026-06-11T00:56:00.000Z",
    },
  ],
  breakBankTransactions: [],
  breakSessions: [],
  sleepLogs: [
    {
      id: "sleep-1",
      local_date: "2026-06-11",
      sleep_duration_minutes: 450,
      energy_score: 4,
      created_at: "2026-06-11T00:00:00.000Z",
      updated_at: "2026-06-11T00:00:00.000Z",
    },
  ],
  appSettings: [],
};

describe("analytics summary", () => {
  it("aggregates reviewed focus sessions and daily context", () => {
    const summary = buildAnalyticsSummary(baseSnapshot, {
      startDate: "2026-06-11",
      endDate: "2026-06-11",
      grain: "day",
    });

    expect(summary.totalFocusMinutes).toBe(25);
    expect(summary.totalStartupDelayMinutes).toBe(30);
    expect(summary.totalAttentionSwitchCount).toBe(2);
    expect(summary.statusCounts["status-completed"]).toBe(1);
    expect(summary.productLabelCounts["product-note"]).toBe(1);
    expect(summary.blockerLabelCounts["blocker-none"]).toBe(1);
    expect(summary.averageSleepDurationMinutes).toBe(450);
    expect(summary.averageEnergyScore).toBe(4);
    expect(summary.reviewEntries[0]?.productNote).toBe("整理了一页笔记");
    expect(summary.reviewEntries[0]?.blockerNote).toBe("没有明显阻塞");
    expect(summary.reviewEntries[0]?.productLabelIds).toContain("product-note");
    expect(summary.reviewEntries[0]?.blockerLabelIds).toContain("blocker-none");
  });

  it("builds five-minute daily timeline cells", () => {
    const timeline = buildDayTimeline(baseSnapshot, "2026-06-11");

    expect(timeline).toHaveLength(288);
    expect(timeline.filter((cell) => cell.state === "startup_delay")).toHaveLength(6);
    expect(timeline.filter((cell) => cell.state === "focus")).toHaveLength(5);
    expect(timeline.filter((cell) => cell.state === "blocked")).toHaveLength(0);
  });
});
