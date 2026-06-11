import { describe, expect, it } from "vitest";
import { computeStartupDelayForArrival } from "./startup-delay";
import type { ArrivalSessionRecord, FocusSessionRecord } from "../types";

const arrival: ArrivalSessionRecord = {
  id: "arrival-1",
  local_date: "2026-06-11",
  arrived_at: "2026-06-11T00:00:00.000Z",
  created_at: "2026-06-11T00:00:00.000Z",
  updated_at: "2026-06-11T00:00:00.000Z",
};

function focusSession(
  id: string,
  startedAt: string,
): FocusSessionRecord {
  return {
    id,
    arrival_session_id: "arrival-1",
    local_date: "2026-06-11",
    planned_duration_minutes: 25,
    actual_duration_minutes: 25,
    started_at: startedAt,
    paused_total_seconds: 0,
    completed_at: startedAt,
    state: "reviewed",
    earned_break_minutes: 5,
    created_at: startedAt,
    updated_at: startedAt,
  };
}

describe("startup delay", () => {
  it("uses the first linked focus session", () => {
    const result = computeStartupDelayForArrival(arrival, [
      focusSession("focus-late", "2026-06-11T01:00:00.000Z"),
      focusSession("focus-first", "2026-06-11T00:30:00.000Z"),
    ]);

    expect(result).toMatchObject({
      firstFocusSessionId: "focus-first",
      startupDelayMinutes: 30,
      status: "started",
    });
  });

  it("does not turn missing focus into zero delay", () => {
    const result = computeStartupDelayForArrival(arrival, []);

    expect(result.status).toBe("not_started");
    expect(result.startupDelayMinutes).toBeUndefined();
  });
});
