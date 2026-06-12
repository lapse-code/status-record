import { describe, expect, it } from "vitest";
import {
  getLocalDateStartUtcMs,
  getLocalMinuteOfDay,
  toLocalDate,
} from "./time";

describe("time zone utilities", () => {
  it("formats local dates in the requested IANA time zone", () => {
    const timestamp = new Date("2026-06-11T23:30:00.000Z");

    expect(toLocalDate(timestamp, "Asia/Tokyo")).toBe("2026-06-12");
    expect(toLocalDate(timestamp, "America/Los_Angeles")).toBe("2026-06-11");
  });

  it("finds the UTC boundary for a local date in a fixed time zone", () => {
    expect(
      new Date(
        getLocalDateStartUtcMs("2026-06-12", "Asia/Tokyo"),
      ).toISOString(),
    ).toBe("2026-06-11T15:00:00.000Z");
  });

  it("maps an absolute timestamp to local minutes in the requested time zone", () => {
    const timestamp = new Date("2026-06-11T23:30:00.000Z");

    expect(getLocalMinuteOfDay(timestamp, "Asia/Tokyo")).toBe(8 * 60 + 30);
    expect(getLocalMinuteOfDay(timestamp, "America/Los_Angeles")).toBe(
      16 * 60 + 30,
    );
  });
});
