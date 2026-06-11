import { describe, expect, it } from "vitest";
import { calculateCompletedFocusMinutes } from "./focus-session";
import type { FocusSessionRecord } from "../types";

function focusSession(
  overrides: Partial<FocusSessionRecord> = {},
): FocusSessionRecord {
  return {
    id: "focus-1",
    arrival_session_id: "arrival-1",
    local_date: "2026-06-11",
    planned_duration_minutes: 25,
    started_at: "2026-06-11T00:00:00.000Z",
    paused_total_seconds: 0,
    state: "running",
    earned_break_minutes: 0,
    created_at: "2026-06-11T00:00:00.000Z",
    updated_at: "2026-06-11T00:00:00.000Z",
    ...overrides,
  };
}

describe("focus session rules", () => {
  it("records early manual completion by actual active minutes", () => {
    expect(
      calculateCompletedFocusMinutes(
        focusSession(),
        "2026-06-11T00:01:30.000Z",
      ),
    ).toBe(1);
  });

  it("caps delayed natural completion at the planned duration", () => {
    expect(
      calculateCompletedFocusMinutes(
        focusSession(),
        "2026-06-11T00:30:00.000Z",
      ),
    ).toBe(25);
  });

  it("excludes already accumulated pause time", () => {
    expect(
      calculateCompletedFocusMinutes(
        focusSession({ paused_total_seconds: 300 }),
        "2026-06-11T00:20:00.000Z",
      ),
    ).toBe(15);
  });

  it("excludes the active pause when completed while paused", () => {
    expect(
      calculateCompletedFocusMinutes(
        focusSession({
          state: "paused",
          current_pause_started_at: "2026-06-11T00:10:00.000Z",
        }),
        "2026-06-11T00:20:00.000Z",
      ),
    ).toBe(10);
  });
});
