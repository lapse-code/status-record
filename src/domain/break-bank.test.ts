import { describe, expect, it } from "vitest";
import {
  calculateDailyBreakLedger,
  calculateEarnedBreakMinutes,
  calculateNewlyEarnedBreakMinutes,
  calculateUsedBreakMinutes,
} from "./break-bank";
import type { FocusSessionRecord } from "../types";

function focusSession(
  id: string,
  localDate: string,
  actualDurationMinutes: number,
): FocusSessionRecord {
  return {
    id,
    arrival_session_id: `arrival-${id}`,
    local_date: localDate,
    planned_duration_minutes: actualDurationMinutes,
    actual_duration_minutes: actualDurationMinutes,
    started_at: `${localDate}T00:00:00.000Z`,
    paused_total_seconds: 0,
    completed_at: `${localDate}T00:25:00.000Z`,
    state: "reviewed",
    earned_break_minutes: 0,
    created_at: `${localDate}T00:00:00.000Z`,
    updated_at: `${localDate}T00:25:00.000Z`,
  };
}

describe("break bank rules", () => {
  it("earns five break minutes for each completed 25 minute focus block", () => {
    expect(calculateEarnedBreakMinutes(24)).toBe(0);
    expect(calculateEarnedBreakMinutes(25)).toBe(5);
    expect(calculateEarnedBreakMinutes(50)).toBe(10);
    expect(calculateEarnedBreakMinutes(90)).toBe(15);
  });

  it("earns break minutes across multiple focus sessions in one day", () => {
    expect(calculateNewlyEarnedBreakMinutes(15, 15)).toBe(5);
    expect(calculateNewlyEarnedBreakMinutes(30, 10)).toBe(0);
    expect(calculateNewlyEarnedBreakMinutes(20, 30)).toBe(10);
  });

  it("calculates a daily break ledger and progress", () => {
    const ledger = calculateDailyBreakLedger(
      [
        focusSession("today-1", "2026-06-12", 15),
        focusSession("today-2", "2026-06-12", 15),
        focusSession("yesterday", "2026-06-11", 50),
      ],
      [
        {
          id: "used-1",
          local_date: "2026-06-12",
          type: "used",
          minutes: -3,
          created_at: "2026-06-12T00:30:00.000Z",
        },
        {
          id: "used-yesterday",
          local_date: "2026-06-11",
          type: "used",
          minutes: -10,
          created_at: "2026-06-11T00:30:00.000Z",
        },
      ],
      "2026-06-12",
    );

    expect(ledger.focusCreditMinutes).toBe(30);
    expect(ledger.earnedMinutes).toBe(5);
    expect(ledger.balanceMinutes).toBe(2);
    expect(ledger.progressMinutes).toBe(5);
  });

  it("uses legacy earned transactions only when no focus credit exists", () => {
    expect(
      calculateDailyBreakLedger(
        [],
        [
          {
            id: "earned-1",
            local_date: "2026-06-12",
            type: "earned",
            minutes: 5,
            created_at: "2026-06-12T00:00:00.000Z",
          },
        ],
        "2026-06-12",
      ).balanceMinutes,
    ).toBe(5);

    expect(
      calculateDailyBreakLedger(
        [focusSession("today", "2026-06-12", 25)],
        [
          {
            id: "earned-1",
            local_date: "2026-06-12",
            type: "earned",
            minutes: 5,
            created_at: "2026-06-12T00:00:00.000Z",
          },
        ],
        "2026-06-12",
      ).balanceMinutes,
    ).toBe(5);
  });

  it("keeps daily break balance independent between days", () => {
    expect(
      calculateDailyBreakLedger(
        [focusSession("yesterday", "2026-06-11", 50)],
        [
        {
          id: "used-yesterday",
          local_date: "2026-06-11",
          type: "used",
          minutes: -5,
          created_at: "2026-06-11T00:30:00.000Z",
        },
        ],
        "2026-06-12",
      ).balanceMinutes,
    ).toBe(0);
  });

  it("refunds unused minutes when a break ends early", () => {
    expect(calculateUsedBreakMinutes(5, 0, true)).toBe(1);
    expect(calculateUsedBreakMinutes(5, 121, true)).toBe(3);
    expect(calculateUsedBreakMinutes(5, 600, true)).toBe(5);
    expect(calculateUsedBreakMinutes(5, 0, false)).toBe(5);
  });
});
