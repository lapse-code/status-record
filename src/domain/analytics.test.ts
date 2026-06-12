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
      left_at: "2026-06-11T00:55:00.000Z",
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
  focusSegments: [],
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

  it("marks break sessions as a separate timeline state", () => {
    const snapshot: AppSnapshot = {
      ...baseSnapshot,
      arrivalSessions: [
        {
          id: "arrival-break",
          local_date: "2026-06-11",
          arrived_at: localIso(0, 0),
          left_at: localIso(0, 15),
          created_at: localIso(0, 0),
          updated_at: localIso(0, 15),
        },
      ],
      focusSessions: [],
      sessionReviews: [],
      sessionReviewLabels: [],
      breakSessions: [
        {
          id: "break-1",
          local_date: "2026-06-11",
          planned_duration_minutes: 5,
          actual_duration_minutes: 5,
          started_at: localIso(0, 5),
          completed_at: localIso(0, 10),
          state: "completed",
          created_at: localIso(0, 5),
          updated_at: localIso(0, 10),
        },
      ],
      sleepLogs: [],
    };
    const timeline = buildDayTimeline(snapshot, "2026-06-11");

    expect(timeline[0]?.state).toBe("startup_delay");
    expect(timeline[1]?.state).toBe("break");
    expect(timeline[2]?.state).toBe("startup_delay");
  });

  it("prefers startup delay over break when their minute counts tie", () => {
    const snapshot: AppSnapshot = {
      ...baseSnapshot,
      arrivalSessions: [
        {
          id: "arrival-break-delay-tie",
          local_date: "2026-06-11",
          arrived_at: localIso(0, 2),
          left_at: localIso(0, 4),
          created_at: localIso(0, 2),
          updated_at: localIso(0, 4),
        },
      ],
      focusSessions: [],
      sessionReviews: [],
      sessionReviewLabels: [],
      breakSessions: [
        {
          id: "break-delay-tie",
          local_date: "2026-06-11",
          planned_duration_minutes: 2,
          actual_duration_minutes: 2,
          started_at: localIso(0, 0),
          completed_at: localIso(0, 2),
          state: "completed",
          created_at: localIso(0, 0),
          updated_at: localIso(0, 2),
        },
      ],
      sleepLogs: [],
    };

    expect(buildDayTimeline(snapshot, "2026-06-11")[0]?.state).toBe(
      "startup_delay",
    );
  });

  it("keeps arrival waiting time after focus as startup delay", () => {
    const snapshot: AppSnapshot = {
      ...baseSnapshot,
      arrivalSessions: [
        {
          id: "arrival-waiting",
          local_date: "2026-06-11",
          arrived_at: localIso(0, 0),
          left_at: localIso(0, 15),
          created_at: localIso(0, 0),
          updated_at: localIso(0, 15),
        },
      ],
      focusSessions: [
        {
          id: "focus-waiting",
          arrival_session_id: "arrival-waiting",
          local_date: "2026-06-11",
          planned_duration_minutes: 5,
          actual_duration_minutes: 5,
          started_at: localIso(0, 0),
          paused_total_seconds: 0,
          completed_at: localIso(0, 5),
          state: "reviewed",
          earned_break_minutes: 0,
          created_at: localIso(0, 0),
          updated_at: localIso(0, 5),
        },
      ],
      sessionReviews: [
        {
          id: "review-waiting",
          focus_session_id: "focus-waiting",
          status_label_id: "status-completed",
          attention_switch_count: 0,
          created_at: localIso(0, 5),
          updated_at: localIso(0, 5),
        },
      ],
      sessionReviewLabels: [
        {
          id: "review-label-waiting",
          review_id: "review-waiting",
          label_id: "blocker-none",
          label_type: "blocker",
          created_at: localIso(0, 5),
        },
      ],
      breakSessions: [],
      sleepLogs: [],
    };
    const timeline = buildDayTimeline(snapshot, "2026-06-11");

    expect(timeline[0]?.state).toBe("focus");
    expect(timeline[1]?.state).toBe("startup_delay");
    expect(timeline[2]?.state).toBe("startup_delay");
  });

  it("uses focus segments so paused time remains startup delay", () => {
    const snapshot: AppSnapshot = {
      ...baseSnapshot,
      arrivalSessions: [
        {
          id: "arrival-paused",
          local_date: "2026-06-11",
          arrived_at: localIso(0, 0),
          left_at: localIso(0, 25),
          created_at: localIso(0, 0),
          updated_at: localIso(0, 25),
        },
      ],
      focusSessions: [
        {
          id: "focus-paused",
          arrival_session_id: "arrival-paused",
          local_date: "2026-06-11",
          planned_duration_minutes: 25,
          actual_duration_minutes: 10,
          started_at: localIso(0, 0),
          paused_total_seconds: 600,
          completed_at: localIso(0, 20),
          state: "reviewed",
          earned_break_minutes: 0,
          created_at: localIso(0, 0),
          updated_at: localIso(0, 20),
        },
      ],
      focusSegments: [
        {
          id: "focus-segment-paused-1",
          focus_session_id: "focus-paused",
          local_date: "2026-06-11",
          started_at: localIso(0, 0),
          ended_at: localIso(0, 5),
          state: "completed",
          created_at: localIso(0, 0),
          updated_at: localIso(0, 5),
        },
        {
          id: "focus-segment-paused-2",
          focus_session_id: "focus-paused",
          local_date: "2026-06-11",
          started_at: localIso(0, 15),
          ended_at: localIso(0, 20),
          state: "completed",
          created_at: localIso(0, 15),
          updated_at: localIso(0, 20),
        },
      ],
      sessionReviews: [
        {
          id: "review-paused",
          focus_session_id: "focus-paused",
          status_label_id: "status-completed",
          attention_switch_count: 0,
          created_at: localIso(0, 20),
          updated_at: localIso(0, 20),
        },
      ],
      sessionReviewLabels: [
        {
          id: "review-label-paused",
          review_id: "review-paused",
          label_id: "blocker-none",
          label_type: "blocker",
          created_at: localIso(0, 20),
        },
      ],
      breakSessions: [],
      sleepLogs: [],
    };
    const timeline = buildDayTimeline(snapshot, "2026-06-11");

    expect(timeline[0]?.state).toBe("focus");
    expect(timeline[1]?.state).toBe("startup_delay");
    expect(timeline[2]?.state).toBe("startup_delay");
    expect(timeline[3]?.state).toBe("focus");
    expect(timeline[4]?.state).toBe("startup_delay");
  });

  it("marks an open arrival as live startup delay up to now", () => {
    const snapshot: AppSnapshot = {
      ...baseSnapshot,
      arrivalSessions: [
        {
          id: "arrival-live-delay",
          local_date: "2026-06-11",
          arrived_at: localIso(0, 0),
          created_at: localIso(0, 0),
          updated_at: localIso(0, 0),
        },
      ],
      focusSessions: [],
      focusSegments: [],
      sessionReviews: [],
      sessionReviewLabels: [],
      breakSessions: [],
      sleepLogs: [],
    };
    const timeline = buildDayTimeline(
      snapshot,
      "2026-06-11",
      new Date(localIso(0, 14)),
    );

    expect(timeline[0]?.state).toBe("startup_delay");
    expect(timeline[1]?.state).toBe("startup_delay");
    expect(timeline[2]?.state).toBe("startup_delay");
    expect(timeline[3]?.state).toBe("empty");
  });

  it("marks a running focus segment as live focus before review exists", () => {
    const snapshot: AppSnapshot = {
      ...baseSnapshot,
      arrivalSessions: [
        {
          id: "arrival-live-focus",
          local_date: "2026-06-11",
          arrived_at: localIso(0, 0),
          created_at: localIso(0, 0),
          updated_at: localIso(0, 0),
        },
      ],
      focusSessions: [
        {
          id: "focus-live",
          arrival_session_id: "arrival-live-focus",
          local_date: "2026-06-11",
          planned_duration_minutes: 25,
          started_at: localIso(0, 2),
          paused_total_seconds: 0,
          state: "running",
          earned_break_minutes: 0,
          created_at: localIso(0, 2),
          updated_at: localIso(0, 2),
        },
      ],
      focusSegments: [
        {
          id: "focus-segment-live",
          focus_session_id: "focus-live",
          local_date: "2026-06-11",
          started_at: localIso(0, 2),
          state: "running",
          created_at: localIso(0, 2),
          updated_at: localIso(0, 2),
        },
      ],
      sessionReviews: [],
      sessionReviewLabels: [],
      breakSessions: [],
      sleepLogs: [],
    };
    const timeline = buildDayTimeline(
      snapshot,
      "2026-06-11",
      new Date(localIso(0, 5)),
    );

    expect(timeline[0]?.state).toBe("focus");
  });

  it("caps a running focus segment at the planned focus duration", () => {
    const snapshot: AppSnapshot = {
      ...baseSnapshot,
      arrivalSessions: [],
      focusSessions: [
        {
          id: "focus-live-capped",
          local_date: "2026-06-11",
          planned_duration_minutes: 5,
          started_at: localIso(0, 0),
          paused_total_seconds: 0,
          state: "running",
          earned_break_minutes: 0,
          created_at: localIso(0, 0),
          updated_at: localIso(0, 0),
        },
      ],
      focusSegments: [
        {
          id: "focus-segment-live-capped",
          focus_session_id: "focus-live-capped",
          local_date: "2026-06-11",
          started_at: localIso(0, 0),
          state: "running",
          created_at: localIso(0, 0),
          updated_at: localIso(0, 0),
        },
      ],
      sessionReviews: [],
      sessionReviewLabels: [],
      breakSessions: [],
      sleepLogs: [],
    };
    const timeline = buildDayTimeline(
      snapshot,
      "2026-06-11",
      new Date(localIso(0, 14)),
    );

    expect(timeline[0]?.state).toBe("focus");
    expect(timeline[1]?.state).toBe("empty");
    expect(timeline[2]?.state).toBe("empty");
  });

  it("keeps paused focus time as live startup delay", () => {
    const snapshot: AppSnapshot = {
      ...baseSnapshot,
      arrivalSessions: [
        {
          id: "arrival-live-paused",
          local_date: "2026-06-11",
          arrived_at: localIso(0, 0),
          created_at: localIso(0, 0),
          updated_at: localIso(0, 0),
        },
      ],
      focusSessions: [
        {
          id: "focus-live-paused",
          arrival_session_id: "arrival-live-paused",
          local_date: "2026-06-11",
          planned_duration_minutes: 25,
          started_at: localIso(0, 0),
          paused_total_seconds: 0,
          current_pause_started_at: localIso(0, 5),
          state: "paused",
          earned_break_minutes: 0,
          created_at: localIso(0, 0),
          updated_at: localIso(0, 5),
        },
      ],
      focusSegments: [
        {
          id: "focus-segment-live-paused",
          focus_session_id: "focus-live-paused",
          local_date: "2026-06-11",
          started_at: localIso(0, 0),
          ended_at: localIso(0, 5),
          state: "completed",
          created_at: localIso(0, 0),
          updated_at: localIso(0, 5),
        },
      ],
      sessionReviews: [],
      sessionReviewLabels: [],
      breakSessions: [],
      sleepLogs: [],
    };
    const timeline = buildDayTimeline(
      snapshot,
      "2026-06-11",
      new Date(localIso(0, 14)),
    );

    expect(timeline[0]?.state).toBe("focus");
    expect(timeline[1]?.state).toBe("startup_delay");
    expect(timeline[2]?.state).toBe("startup_delay");
  });

  it("does not keep provisional focus color after focus is canceled", () => {
    const snapshot: AppSnapshot = {
      ...baseSnapshot,
      arrivalSessions: [
        {
          id: "arrival-canceled-live",
          local_date: "2026-06-11",
          arrived_at: localIso(0, 0),
          created_at: localIso(0, 0),
          updated_at: localIso(0, 0),
        },
      ],
      focusSessions: [
        {
          id: "focus-canceled-live",
          arrival_session_id: "arrival-canceled-live",
          local_date: "2026-06-11",
          planned_duration_minutes: 25,
          started_at: localIso(0, 0),
          paused_total_seconds: 0,
          canceled_at: localIso(0, 3),
          state: "canceled",
          earned_break_minutes: 0,
          created_at: localIso(0, 0),
          updated_at: localIso(0, 3),
        },
      ],
      focusSegments: [
        {
          id: "focus-segment-canceled-live",
          focus_session_id: "focus-canceled-live",
          local_date: "2026-06-11",
          started_at: localIso(0, 0),
          ended_at: localIso(0, 3),
          state: "canceled",
          created_at: localIso(0, 0),
          updated_at: localIso(0, 3),
        },
      ],
      sessionReviews: [],
      sessionReviewLabels: [],
      breakSessions: [],
      sleepLogs: [],
    };
    const timeline = buildDayTimeline(
      snapshot,
      "2026-06-11",
      new Date(localIso(0, 5)),
    );

    expect(timeline[0]?.state).toBe("startup_delay");
  });

  it("marks completed focus as focus while it is waiting for review", () => {
    const snapshot: AppSnapshot = {
      ...baseSnapshot,
      arrivalSessions: [
        {
          id: "arrival-pending-review",
          local_date: "2026-06-11",
          arrived_at: localIso(0, 0),
          left_at: localIso(0, 5),
          created_at: localIso(0, 0),
          updated_at: localIso(0, 5),
        },
      ],
      focusSessions: [
        {
          id: "focus-pending-review",
          arrival_session_id: "arrival-pending-review",
          local_date: "2026-06-11",
          planned_duration_minutes: 25,
          actual_duration_minutes: 5,
          started_at: localIso(0, 0),
          paused_total_seconds: 0,
          completed_at: localIso(0, 5),
          state: "completed",
          earned_break_minutes: 0,
          created_at: localIso(0, 0),
          updated_at: localIso(0, 5),
        },
      ],
      focusSegments: [
        {
          id: "focus-segment-pending-review",
          focus_session_id: "focus-pending-review",
          local_date: "2026-06-11",
          started_at: localIso(0, 0),
          ended_at: localIso(0, 5),
          state: "completed",
          created_at: localIso(0, 0),
          updated_at: localIso(0, 5),
        },
      ],
      sessionReviews: [],
      sessionReviewLabels: [],
      breakSessions: [],
      sleepLogs: [],
    };

    expect(buildDayTimeline(snapshot, "2026-06-11")[0]?.state).toBe("focus");
  });

  it("marks a running break as live break time", () => {
    const snapshot: AppSnapshot = {
      ...baseSnapshot,
      arrivalSessions: [],
      focusSessions: [],
      focusSegments: [],
      sessionReviews: [],
      sessionReviewLabels: [],
      breakSessions: [
        {
          id: "break-live",
          local_date: "2026-06-11",
          planned_duration_minutes: 10,
          started_at: localIso(0, 0),
          state: "running",
          created_at: localIso(0, 0),
          updated_at: localIso(0, 0),
        },
      ],
      sleepLogs: [],
    };
    const timeline = buildDayTimeline(
      snapshot,
      "2026-06-11",
      new Date(localIso(0, 5)),
    );

    expect(timeline[0]?.state).toBe("break");
  });

  it("places timeline cells using the record time zone", () => {
    const snapshot: AppSnapshot = {
      ...baseSnapshot,
      arrivalSessions: [],
      focusSessions: [
        {
          id: "focus-tokyo-zone",
          local_date: "2026-06-12",
          time_zone: "Asia/Tokyo",
          planned_duration_minutes: 5,
          actual_duration_minutes: 5,
          started_at: "2026-06-11T23:30:00.000Z",
          paused_total_seconds: 0,
          completed_at: "2026-06-11T23:35:00.000Z",
          state: "reviewed",
          earned_break_minutes: 0,
          created_at: "2026-06-11T23:30:00.000Z",
          updated_at: "2026-06-11T23:35:00.000Z",
        },
      ],
      focusSegments: [
        {
          id: "focus-segment-tokyo-zone",
          focus_session_id: "focus-tokyo-zone",
          local_date: "2026-06-12",
          time_zone: "Asia/Tokyo",
          started_at: "2026-06-11T23:30:00.000Z",
          ended_at: "2026-06-11T23:35:00.000Z",
          state: "completed",
          created_at: "2026-06-11T23:30:00.000Z",
          updated_at: "2026-06-11T23:35:00.000Z",
        },
      ],
      sessionReviews: [
        {
          id: "review-tokyo-zone",
          focus_session_id: "focus-tokyo-zone",
          status_label_id: "status-completed",
          attention_switch_count: 0,
          created_at: "2026-06-11T23:35:00.000Z",
          updated_at: "2026-06-11T23:35:00.000Z",
        },
      ],
      sessionReviewLabels: [],
      breakSessions: [],
      sleepLogs: [],
    };
    const timeline = buildDayTimeline(snapshot, "2026-06-12");
    const tokyoSlot = 8 * 12 + 6;

    expect(timeline[tokyoSlot]?.timeLabel).toBe("08:30");
    expect(timeline[tokyoSlot]?.state).toBe("focus");
  });

  it("continues a cross-midnight segment into the next local day", () => {
    const snapshot: AppSnapshot = {
      ...baseSnapshot,
      arrivalSessions: [],
      focusSessions: [
        {
          id: "focus-cross-midnight",
          local_date: "2026-06-12",
          time_zone: "Asia/Tokyo",
          planned_duration_minutes: 10,
          actual_duration_minutes: 7,
          started_at: "2026-06-12T14:56:00.000Z",
          paused_total_seconds: 0,
          completed_at: "2026-06-12T15:03:00.000Z",
          state: "completed",
          earned_break_minutes: 0,
          created_at: "2026-06-12T14:56:00.000Z",
          updated_at: "2026-06-12T15:03:00.000Z",
        },
      ],
      focusSegments: [
        {
          id: "focus-segment-cross-midnight",
          focus_session_id: "focus-cross-midnight",
          local_date: "2026-06-12",
          time_zone: "Asia/Tokyo",
          started_at: "2026-06-12T14:56:00.000Z",
          ended_at: "2026-06-12T15:03:00.000Z",
          state: "completed",
          created_at: "2026-06-12T14:56:00.000Z",
          updated_at: "2026-06-12T15:03:00.000Z",
        },
      ],
      sessionReviews: [],
      sessionReviewLabels: [],
      breakSessions: [],
      sleepLogs: [],
    };

    const firstDayTimeline = buildDayTimeline(snapshot, "2026-06-12");
    const nextDayTimeline = buildDayTimeline(snapshot, "2026-06-13");

    expect(firstDayTimeline[287]?.timeLabel).toBe("23:55");
    expect(firstDayTimeline[287]?.state).toBe("focus");
    expect(nextDayTimeline[0]?.timeLabel).toBe("00:00");
    expect(nextDayTimeline[0]?.state).toBe("focus");
  });
});

function localIso(hour: number, minute: number) {
  return new Date(Date.UTC(2026, 5, 10, 15 + hour, minute, 0, 0)).toISOString();
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
        left_at: localIso(0, 5),
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
