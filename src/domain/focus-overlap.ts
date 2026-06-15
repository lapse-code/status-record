import type { FocusSegmentRecord, FocusSessionRecord } from "../types";

export type FocusOverlapRange = {
  startMs: number;
  endMs: number;
};

export function getEffectiveFocusOverlapRanges(
  session: FocusSessionRecord,
  segments: FocusSegmentRecord[] = [],
): FocusOverlapRange[] {
  const activeSegments = segments
    .filter(
      (segment) =>
        segment.focus_session_id === session.id &&
        segment.state !== "canceled" &&
        !segment.deleted_at,
    )
    .sort(
      (a, b) =>
        new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
    );

  if (activeSegments.length > 0) {
    const ranges: FocusOverlapRange[] = [];
    let remainingBudgetMs = getEffectiveFocusBudgetMs(session);

    for (const segment of activeSegments) {
      if (remainingBudgetMs <= 0 || !segment.ended_at) {
        continue;
      }

      const startMs = new Date(segment.started_at).getTime();
      const endMs = new Date(segment.ended_at).getTime();
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
        continue;
      }

      const cappedEndMs = Math.min(endMs, startMs + remainingBudgetMs);
      if (cappedEndMs <= startMs) {
        continue;
      }

      ranges.push({ startMs, endMs: cappedEndMs });
      remainingBudgetMs -= cappedEndMs - startMs;
    }

    if (ranges.length > 0) {
      return ranges;
    }
  }

  const startMs = new Date(session.started_at).getTime();
  if (!Number.isFinite(startMs)) {
    return [];
  }

  const budgetMs = getEffectiveFocusBudgetMs(session);
  if (budgetMs <= 0) {
    return [];
  }

  return [{ startMs, endMs: startMs + budgetMs }];
}

export function hasFocusOverlap(
  startMs: number,
  endMs: number,
  ranges: FocusOverlapRange[],
): boolean {
  return ranges.some((range) => startMs < range.endMs && endMs > range.startMs);
}

function getEffectiveFocusBudgetMs(session: FocusSessionRecord): number {
  const durationMinutes =
    typeof session.actual_duration_minutes === "number"
      ? session.actual_duration_minutes
      : session.planned_duration_minutes;

  if (!Number.isFinite(durationMinutes)) {
    return 0;
  }

  return Math.max(0, Math.round(durationMinutes)) * 60_000;
}
