import { describe, expect, it } from "vitest";
import type { AppSnapshot } from "../types";
import {
  buildCalendarEntries,
  groupCalendarProductLabelsByDate,
} from "./calendar";

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
      created_at: "2026-06-15T00:00:00.000Z",
      updated_at: "2026-06-15T00:00:00.000Z",
    },
    {
      id: "product-code",
      type: "product",
      name: "代码",
      color: "#2f855a",
      is_default: true,
      is_active: true,
      sort_order: 10,
      created_at: "2026-06-15T00:00:00.000Z",
      updated_at: "2026-06-15T00:00:00.000Z",
    },
    {
      id: "product-note",
      type: "product",
      name: "笔记",
      color: "#2b6cb0",
      is_default: true,
      is_active: true,
      sort_order: 20,
      created_at: "2026-06-15T00:00:00.000Z",
      updated_at: "2026-06-15T00:00:00.000Z",
    },
    {
      id: "blocker-none",
      type: "blocker",
      name: "无",
      color: "#2f855a",
      is_default: true,
      is_active: true,
      sort_order: 10,
      created_at: "2026-06-15T00:00:00.000Z",
      updated_at: "2026-06-15T00:00:00.000Z",
    },
  ],
  arrivalSessions: [],
  focusSessions: [
    {
      id: "focus-1",
      local_date: "2026-06-15",
      time_zone: "Asia/Tokyo",
      planned_duration_minutes: 25,
      actual_duration_minutes: 25,
      started_at: "2026-06-15T09:00:00.000Z",
      paused_total_seconds: 0,
      completed_at: "2026-06-15T10:30:00.000Z",
      state: "reviewed",
      earned_break_minutes: 5,
      created_at: "2026-06-15T09:00:00.000Z",
      updated_at: "2026-06-15T10:30:00.000Z",
    },
  ],
  focusSegments: [
    {
      id: "segment-1",
      focus_session_id: "focus-1",
      local_date: "2026-06-15",
      time_zone: "Asia/Tokyo",
      started_at: "2026-06-15T09:00:00.000Z",
      ended_at: "2026-06-15T10:00:00.000Z",
      state: "completed",
      created_at: "2026-06-15T09:00:00.000Z",
      updated_at: "2026-06-15T10:00:00.000Z",
    },
  ],
  sessionReviews: [
    {
      id: "review-1",
      focus_session_id: "focus-1",
      status_label_id: "status-completed",
      attention_switch_count: 1,
      product_note: "实现日历页面",
      created_at: "2026-06-15T10:30:00.000Z",
      updated_at: "2026-06-15T10:30:00.000Z",
    },
  ],
  sessionReviewLabels: [
    {
      id: "review-label-1",
      review_id: "review-1",
      label_id: "product-code",
      label_type: "product",
      created_at: "2026-06-15T10:30:00.000Z",
    },
    {
      id: "review-label-2",
      review_id: "review-1",
      label_id: "product-code",
      label_type: "product",
      created_at: "2026-06-15T10:30:00.000Z",
    },
    {
      id: "review-label-3",
      review_id: "review-1",
      label_id: "blocker-none",
      label_type: "blocker",
      created_at: "2026-06-15T10:30:00.000Z",
    },
  ],
  breakBankTransactions: [],
  breakSessions: [],
  sleepLogs: [],
  appSettings: [],
};

describe("calendar entries", () => {
  it("uses effective focus ranges instead of completed_at for event placement", () => {
    const entries = buildCalendarEntries(baseSnapshot, {
      startDate: "2026-06-15",
      endDate: "2026-06-15",
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      localDate: "2026-06-15",
      startTimeLabel: "18:00",
      endTimeLabel: "18:25",
      startMinuteOfDay: 18 * 60,
      endMinuteOfDay: 18 * 60 + 25,
      durationMinutes: 25,
      productNote: "实现日历页面",
    });
  });

  it("deduplicates product labels for month cells", () => {
    const entries = buildCalendarEntries(baseSnapshot, {
      startDate: "2026-06-15",
      endDate: "2026-06-15",
    });
    const labelsByDate = groupCalendarProductLabelsByDate(entries);

    expect(labelsByDate.get("2026-06-15")).toEqual([
      { id: "product-code", name: "代码", color: "#2f855a" },
    ]);
  });
});
