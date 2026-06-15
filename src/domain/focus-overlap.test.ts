import { describe, expect, it } from "vitest";
import {
  getEffectiveFocusOverlapRanges,
  hasFocusOverlap,
} from "./focus-overlap";
import type { FocusSegmentRecord, FocusSessionRecord } from "../types";

function focusSession(
  overrides: Partial<FocusSessionRecord> = {},
): FocusSessionRecord {
  return {
    id: "focus-1",
    local_date: "2026-06-15",
    time_zone: "Asia/Tokyo",
    planned_duration_minutes: 25,
    actual_duration_minutes: 25,
    started_at: "2026-06-15T08:42:05.000Z",
    paused_total_seconds: 0,
    completed_at: "2026-06-15T09:31:37.000Z",
    state: "reviewed",
    earned_break_minutes: 5,
    created_at: "2026-06-15T08:42:05.000Z",
    updated_at: "2026-06-15T09:31:37.000Z",
    ...overrides,
  };
}

function focusSegment(
  overrides: Partial<FocusSegmentRecord> = {},
): FocusSegmentRecord {
  return {
    id: "segment-1",
    focus_session_id: "focus-1",
    local_date: "2026-06-15",
    time_zone: "Asia/Tokyo",
    started_at: "2026-06-15T08:42:05.000Z",
    ended_at: "2026-06-15T09:31:37.000Z",
    state: "completed",
    created_at: "2026-06-15T08:42:05.000Z",
    updated_at: "2026-06-15T09:31:37.000Z",
    ...overrides,
  };
}

describe("focus overlap rules", () => {
  it("caps a stored segment by the effective focus duration", () => {
    const ranges = getEffectiveFocusOverlapRanges(focusSession(), [focusSegment()]);

    expect(ranges).toEqual([
      {
        startMs: Date.parse("2026-06-15T08:42:05.000Z"),
        endMs: Date.parse("2026-06-15T09:07:05.000Z"),
      },
    ]);

    expect(
      hasFocusOverlap(
        Date.parse("2026-06-15T09:10:00.000Z"),
        Date.parse("2026-06-15T09:20:00.000Z"),
        ranges,
      ),
    ).toBe(false);
  });

  it("still blocks manual records inside the effective focus range", () => {
    const ranges = getEffectiveFocusOverlapRanges(focusSession(), [focusSegment()]);

    expect(
      hasFocusOverlap(
        Date.parse("2026-06-15T09:00:00.000Z"),
        Date.parse("2026-06-15T09:10:00.000Z"),
        ranges,
      ),
    ).toBe(true);
  });

  it("does not create an overlap range for zero effective minutes", () => {
    expect(
      getEffectiveFocusOverlapRanges(
        focusSession({
          actual_duration_minutes: 0,
        }),
        [],
      ),
    ).toEqual([]);
  });
});
