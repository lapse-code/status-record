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

  it("uses the majority minute state inside each five-minute timeline cell", () => {
    const oneMinuteDelaySnapshot = createBoundaryTimelineSnapshot({
      focusStartMinute: 1,
      focusMinutes: 4,
    });
    const fourMinuteDelaySnapshot = createBoundaryTimelineSnapshot({
      focusStartMinute: 4,
      focusMinutes: 1,
    });

    expect(buildDayTimeline(oneMinuteDelaySnapshot, "2026-06-11")[0]?.state).toBe(
      "focus",
    );
    expect(buildDayTimeline(fourMinuteDelaySnapshot, "2026-06-11")[0]?.state).toBe(
      "startup_delay",
    );
  });

  it("uses state priority only when five-minute timeline minute counts tie", () => {
    const snapshot = createTieTimelineSnapshot();

    expect(buildDayTimeline(snapshot, "2026-06-11")[0]?.state).toBe("blocked");
  });
});

function localIso(hour: number, minute: number) {
  return new Date(2026, 5, 11, hour, minute, 0, 0).toISOString();
}

function createBoundaryTimelineSnapshot({
  focusStartMinute,
  focusMinutes,
}: {
  focusStartMinute: number;
  focusMinutes: number;
}): AppSnapshot {
  return {
    ...baseSnapshot,
    arrivalSessions: [
      {
        id: "arrival-boundary",
        local_date: "2026-06-11",
        arrived_at: localIso(0, 0),
        created_at: localIso(0, 0),
        updated_at: localIso(0, 0),
      },
    ],
    focusSessions: [
      {
        id: "focus-boundary",
        arrival_session_id: "arrival-boundary",
        local_date: "2026-06-11",
        planned_duration_minutes: 5,
        actual_duration_minutes: focusMinutes,
        started_at: localIso(0, focusStartMinute),
        paused_total_seconds: 0,
        completed_at: localIso(0, focusStartMinute + focusMinutes),
        state: "reviewed",
        earned_break_minutes: 0,
        created_at: localIso(0, focusStartMinute),
        updated_at: localIso(0, focusStartMinute + focusMinutes),
      },
    ],
    sessionReviews: [
      {
        id: "review-boundary",
        focus_session_id: "focus-boundary",
        status_label_id: "status-completed",
        attention_switch_count: 0,
        created_at: localIso(0, focusStartMinute + focusMinutes),
        updated_at: localIso(0, focusStartMinute + focusMinutes),
      },
    ],
    sessionReviewLabels: [
      {
        id: "review-label-boundary",
        review_id: "review-boundary",
        label_id: "blocker-none",
        label_type: "blocker",
        created_at: localIso(0, focusStartMinute + focusMinutes),
      },
    ],
    sleepLogs: [],
  };
}

function createTieTimelineSnapshot(): AppSnapshot {
  return {
    ...baseSnapshot,
    labels: [
      ...baseSnapshot.labels,
      {
        id: "status-stuck",
        type: "session_status",
        name: "卡住",
        color: "#805ad5",
        is_default: true,
        is_active: true,
        sort_order: 40,
        created_at: localIso(0, 0),
        updated_at: localIso(0, 0),
      },
    ],
    arrivalSessions: [],
    focusSessions: [
      {
        id: "focus-normal-tie",
        local_date: "2026-06-11",
        planned_duration_minutes: 2,
        actual_duration_minutes: 2,
        started_at: localIso(0, 0),
        paused_total_seconds: 0,
        completed_at: localIso(0, 2),
        state: "reviewed",
        earned_break_minutes: 0,
        created_at: localIso(0, 0),
        updated_at: localIso(0, 2),
      },
      {
        id: "focus-blocked-tie",
        local_date: "2026-06-11",
        planned_duration_minutes: 2,
        actual_duration_minutes: 2,
        started_at: localIso(0, 2),
        paused_total_seconds: 0,
        completed_at: localIso(0, 4),
        state: "reviewed",
        earned_break_minutes: 0,
        created_at: localIso(0, 2),
        updated_at: localIso(0, 4),
      },
    ],
    sessionReviews: [
      {
        id: "review-normal-tie",
        focus_session_id: "focus-normal-tie",
        status_label_id: "status-completed",
        attention_switch_count: 0,
        created_at: localIso(0, 2),
        updated_at: localIso(0, 2),
      },
      {
        id: "review-blocked-tie",
        focus_session_id: "focus-blocked-tie",
        status_label_id: "status-stuck",
        attention_switch_count: 0,
        created_at: localIso(0, 4),
        updated_at: localIso(0, 4),
      },
    ],
    sessionReviewLabels: [
      {
        id: "review-label-normal-tie",
        review_id: "review-normal-tie",
        label_id: "blocker-none",
        label_type: "blocker",
        created_at: localIso(0, 2),
      },
      {
        id: "review-label-blocked-tie",
        review_id: "review-blocked-tie",
        label_id: "blocker-none",
        label_type: "blocker",
        created_at: localIso(0, 4),
      },
    ],
    sleepLogs: [],
  };
}
