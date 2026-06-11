import { describe, expect, it } from "vitest";
import {
  calculateBreakBalance,
  calculateEarnedBreakMinutes,
  calculateUsedBreakMinutes,
} from "./break-bank";

describe("break bank rules", () => {
  it("earns five break minutes for each completed 25 minute focus block", () => {
    expect(calculateEarnedBreakMinutes(24)).toBe(0);
    expect(calculateEarnedBreakMinutes(25)).toBe(5);
    expect(calculateEarnedBreakMinutes(50)).toBe(10);
    expect(calculateEarnedBreakMinutes(90)).toBe(15);
  });

  it("sums earned and used transactions into one balance", () => {
    expect(
      calculateBreakBalance([
        {
          id: "earned-1",
          local_date: "2026-06-11",
          type: "earned",
          minutes: 5,
          created_at: "2026-06-11T00:00:00.000Z",
        },
        {
          id: "used-1",
          local_date: "2026-06-11",
          type: "used",
          minutes: -3,
          created_at: "2026-06-11T00:30:00.000Z",
        },
      ]),
    ).toBe(2);
  });

  it("refunds unused minutes when a break ends early", () => {
    expect(calculateUsedBreakMinutes(5, 0, true)).toBe(1);
    expect(calculateUsedBreakMinutes(5, 121, true)).toBe(3);
    expect(calculateUsedBreakMinutes(5, 600, true)).toBe(5);
    expect(calculateUsedBreakMinutes(5, 0, false)).toBe(5);
  });
});
