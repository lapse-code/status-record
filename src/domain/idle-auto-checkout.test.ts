import { describe, expect, it } from "vitest";
import { getIdleAutoCheckoutDecision } from "./idle-auto-checkout";
import type { AppSnapshot } from "../types";

const baseSnapshot: AppSnapshot = {
  labels: [],
  arrivalSessions: [],
  focusSessions: [],
  focusSegments: [],
  sessionReviews: [],
  sessionReviewLabels: [],
  breakBankTransactions: [],
  breakSessions: [],
  sleepLogs: [],
  appSettings: [],
};

const settings = { enabled: true, maxDelayMinutes: 15 };

describe("idle auto checkout", () => {
  it("returns a due checkout when an open arrival has been idle past the limit", () => {
    const decision = getIdleAutoCheckoutDecision(
      {
        ...baseSnapshot,
        arrivalSessions: [
          {
            id: "arrival-idle",
            local_date: "2026-06-11",
            arrived_at: localIso(0, 0),
            created_at: localIso(0, 0),
            updated_at: localIso(0, 0),
          },
        ],
      },
      new Date(localIso(0, 20)),
      settings,
    );

    expect(decision?.isDue).toBe(true);
    expect(decision?.arrivalSessionId).toBe("arrival-idle");
    expect(decision?.idleSince).toBe(localIso(0, 0));
    expect(decision?.checkoutAt).toBe(localIso(0, 15));
  });

  it("returns a pending timeout before the idle limit is reached", () => {
    const decision = getIdleAutoCheckoutDecision(
      {
        ...baseSnapshot,
        arrivalSessions: [
          {
            id: "arrival-pending",
            local_date: "2026-06-11",
            arrived_at: localIso(0, 0),
            created_at: localIso(0, 0),
            updated_at: localIso(0, 0),
          },
        ],
      },
      new Date(localIso(0, 10)),
      settings,
    );

    expect(decision?.isDue).toBe(false);
    expect(decision?.remainingMs).toBe(5 * 60_000);
    expect(decision?.checkoutAt).toBe(localIso(0, 15));
  });

  it("does not auto checkout while focus currently covers now", () => {
    const decision = getIdleAutoCheckoutDecision(
      {
        ...baseSnapshot,
        arrivalSessions: [
          {
            id: "arrival-focus",
            local_date: "2026-06-11",
            arrived_at: localIso(0, 0),
            created_at: localIso(0, 0),
            updated_at: localIso(0, 0),
          },
        ],
        focusSessions: [
          {
            id: "focus-running",
            arrival_session_id: "arrival-focus",
            local_date: "2026-06-11",
            planned_duration_minutes: 25,
            started_at: localIso(0, 5),
            paused_total_seconds: 0,
            state: "running",
            earned_break_minutes: 0,
            created_at: localIso(0, 5),
            updated_at: localIso(0, 5),
          },
        ],
        focusSegments: [
          {
            id: "focus-segment-running",
            focus_session_id: "focus-running",
            local_date: "2026-06-11",
            started_at: localIso(0, 5),
            state: "running",
            created_at: localIso(0, 5),
            updated_at: localIso(0, 5),
          },
        ],
      },
      new Date(localIso(0, 20)),
      settings,
    );

    expect(decision).toBeNull();
  });

  it("starts idle time after the last completed focus segment", () => {
    const decision = getIdleAutoCheckoutDecision(
      {
        ...baseSnapshot,
        arrivalSessions: [
          {
            id: "arrival-after-focus",
            local_date: "2026-06-11",
            arrived_at: localIso(0, 0),
            created_at: localIso(0, 0),
            updated_at: localIso(0, 0),
          },
        ],
        focusSessions: [
          {
            id: "focus-completed",
            arrival_session_id: "arrival-after-focus",
            local_date: "2026-06-11",
            planned_duration_minutes: 25,
            actual_duration_minutes: 25,
            started_at: localIso(0, 5),
            paused_total_seconds: 0,
            completed_at: localIso(0, 30),
            state: "completed",
            earned_break_minutes: 5,
            created_at: localIso(0, 5),
            updated_at: localIso(0, 30),
          },
        ],
        focusSegments: [
          {
            id: "focus-segment-completed",
            focus_session_id: "focus-completed",
            local_date: "2026-06-11",
            started_at: localIso(0, 5),
            ended_at: localIso(0, 30),
            state: "completed",
            created_at: localIso(0, 5),
            updated_at: localIso(0, 30),
          },
        ],
      },
      new Date(localIso(0, 50)),
      settings,
    );

    expect(decision?.isDue).toBe(true);
    expect(decision?.idleSince).toBe(localIso(0, 30));
    expect(decision?.checkoutAt).toBe(localIso(0, 45));
  });

  it("does not auto checkout while a break covers now", () => {
    const decision = getIdleAutoCheckoutDecision(
      {
        ...baseSnapshot,
        arrivalSessions: [
          {
            id: "arrival-break",
            local_date: "2026-06-11",
            arrived_at: localIso(0, 0),
            created_at: localIso(0, 0),
            updated_at: localIso(0, 0),
          },
        ],
        breakSessions: [
          {
            id: "break-running",
            local_date: "2026-06-11",
            planned_duration_minutes: 20,
            started_at: localIso(0, 10),
            state: "running",
            created_at: localIso(0, 10),
            updated_at: localIso(0, 10),
          },
        ],
      },
      new Date(localIso(0, 20)),
      settings,
    );

    expect(decision).toBeNull();
  });

  it("keeps the checkout time capped at the idle limit after a long background pause", () => {
    const decision = getIdleAutoCheckoutDecision(
      {
        ...baseSnapshot,
        arrivalSessions: [
          {
            id: "arrival-background",
            local_date: "2026-06-11",
            arrived_at: localIso(18, 10),
            created_at: localIso(18, 10),
            updated_at: localIso(18, 10),
          },
        ],
      },
      new Date(localIso(23, 0)),
      settings,
    );

    expect(decision?.isDue).toBe(true);
    expect(decision?.idleSince).toBe(localIso(18, 10));
    expect(decision?.checkoutAt).toBe(localIso(18, 25));
  });
});

function localIso(hour: number, minute: number) {
  return new Date(Date.UTC(2026, 5, 10, 15 + hour, minute, 0, 0)).toISOString();
}
