import type {
  AppSnapshot,
  BreakSessionRecord,
  FocusSegmentRecord,
  FocusSessionRecord,
  Id,
  ISODateTime,
} from "../types";

export interface IdleAutoCheckoutSettings {
  enabled: boolean;
  maxDelayMinutes: number;
}

export interface IdleAutoCheckoutDecision {
  arrivalSessionId: Id;
  idleSince: ISODateTime;
  checkoutAt: ISODateTime;
  remainingMs: number;
  isDue: boolean;
}

type TimeRange = {
  startMs: number;
  endMs: number;
};

export function getIdleAutoCheckoutDecision(
  snapshot: AppSnapshot,
  now: Date,
  settings: IdleAutoCheckoutSettings,
): IdleAutoCheckoutDecision | null {
  if (!settings.enabled || settings.maxDelayMinutes <= 0) {
    return null;
  }

  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) {
    return null;
  }

  const openArrival = snapshot.arrivalSessions
    .filter((arrival) => !arrival.deleted_at && !arrival.left_at)
    .sort(
      (a, b) =>
        new Date(a.arrived_at).getTime() - new Date(b.arrived_at).getTime(),
    )[0];

  if (!openArrival) {
    return null;
  }

  const arrivedAtMs = new Date(openArrival.arrived_at).getTime();
  if (!Number.isFinite(arrivedAtMs) || nowMs <= arrivedAtMs) {
    return null;
  }

  const blockingRanges = buildBlockingRanges(snapshot, now)
    .map((range) => ({
      startMs: Math.max(range.startMs, arrivedAtMs),
      endMs: Math.min(range.endMs, nowMs),
    }))
    .filter((range) => range.endMs > range.startMs)
    .sort((a, b) => a.startMs - b.startMs);

  let idleSinceMs = arrivedAtMs;
  for (const range of blockingRanges) {
    if (range.startMs < nowMs && range.endMs >= nowMs) {
      return null;
    }

    if (range.endMs > idleSinceMs) {
      idleSinceMs = range.endMs;
    }
  }

  const checkoutAtMs = idleSinceMs + Math.round(settings.maxDelayMinutes) * 60_000;
  const remainingMs = checkoutAtMs - nowMs;

  return {
    arrivalSessionId: openArrival.id,
    idleSince: new Date(idleSinceMs).toISOString(),
    checkoutAt: new Date(checkoutAtMs).toISOString(),
    remainingMs,
    isDue: remainingMs <= 0,
  };
}

function buildBlockingRanges(snapshot: AppSnapshot, now: Date): TimeRange[] {
  return [
    ...buildFocusBlockingRanges(snapshot.focusSessions, snapshot.focusSegments, now),
    ...buildBreakBlockingRanges(snapshot.breakSessions, now),
  ];
}

function buildFocusBlockingRanges(
  focusSessions: FocusSessionRecord[],
  focusSegments: FocusSegmentRecord[],
  now: Date,
): TimeRange[] {
  const segmentsByFocusId = new Map<Id, FocusSegmentRecord[]>();
  focusSegments.forEach((segment) => {
    if (segment.deleted_at || segment.state === "canceled") {
      return;
    }

    const segments = segmentsByFocusId.get(segment.focus_session_id) ?? [];
    segments.push(segment);
    segmentsByFocusId.set(segment.focus_session_id, segments);
  });

  segmentsByFocusId.forEach((segments) => {
    segments.sort(
      (a, b) =>
        new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
    );
  });

  const ranges: TimeRange[] = [];

  focusSessions
    .filter((session) => !session.deleted_at && session.state !== "canceled")
    .forEach((session) => {
      const segments = segmentsByFocusId.get(session.id) ?? [];
      if (segments.length > 0) {
        let remainingBudgetMs = getPlannedFocusBudgetMs(session);

        segments.forEach((segment) => {
          if (remainingBudgetMs <= 0) {
            return;
          }

          const startMs = new Date(segment.started_at).getTime();
          const endIso =
            segment.state === "running" ? now.toISOString() : segment.ended_at;
          if (!endIso) {
            return;
          }

          const rawEndMs = new Date(endIso).getTime();
          if (!Number.isFinite(startMs) || !Number.isFinite(rawEndMs)) {
            return;
          }

          const endMs = Math.min(rawEndMs, startMs + remainingBudgetMs);
          if (endMs <= startMs) {
            return;
          }

          ranges.push({ startMs, endMs });
          remainingBudgetMs -= endMs - startMs;
        });
        return;
      }

      const fallbackRange = getFocusFallbackRange(session, now);
      if (fallbackRange) {
        ranges.push(fallbackRange);
      }
    });

  return ranges;
}

function buildBreakBlockingRanges(
  breakSessions: BreakSessionRecord[],
  now: Date,
): TimeRange[] {
  return breakSessions
    .filter((session) => session.state !== "canceled")
    .map((session) => getBreakRange(session, now))
    .filter((range): range is TimeRange => Boolean(range));
}

function getFocusFallbackRange(
  session: FocusSessionRecord,
  now: Date,
): TimeRange | null {
  const startMs = new Date(session.started_at).getTime();
  if (!Number.isFinite(startMs)) {
    return null;
  }

  let endIso: string | undefined;
  if (session.state === "running") {
    const plannedEndMs =
      startMs + getPlannedFocusBudgetMs(session) + session.paused_total_seconds * 1_000;
    endIso = new Date(Math.min(now.getTime(), plannedEndMs)).toISOString();
  } else if (session.state === "paused") {
    endIso = session.current_pause_started_at;
  } else if (typeof session.actual_duration_minutes === "number") {
    endIso = new Date(
      startMs + Math.max(0, Math.round(session.actual_duration_minutes)) * 60_000,
    ).toISOString();
  } else {
    endIso = session.completed_at;
  }

  if (!endIso) {
    return null;
  }

  const endMs = new Date(endIso).getTime();
  if (!Number.isFinite(endMs) || endMs <= startMs) {
    return null;
  }

  return { startMs, endMs };
}

function getBreakRange(
  session: BreakSessionRecord,
  now: Date,
): TimeRange | null {
  const startMs = new Date(session.started_at).getTime();
  if (!Number.isFinite(startMs)) {
    return null;
  }

  const plannedEndMs =
    startMs + Math.max(0, Math.round(session.planned_duration_minutes)) * 60_000;

  let endMs: number;
  if (session.state === "running") {
    endMs = Math.min(now.getTime(), plannedEndMs);
  } else if (session.state === "completed" && !session.ended_early) {
    const durationMinutes =
      typeof session.actual_duration_minutes === "number"
        ? session.actual_duration_minutes
        : session.planned_duration_minutes;
    endMs = startMs + Math.max(0, Math.round(durationMinutes)) * 60_000;
  } else {
    endMs = session.completed_at
      ? new Date(session.completed_at).getTime()
      : plannedEndMs;
  }

  if (!Number.isFinite(endMs) || endMs <= startMs) {
    return null;
  }

  return { startMs, endMs };
}

function getPlannedFocusBudgetMs(session: FocusSessionRecord): number {
  return Math.max(0, Math.round(session.planned_duration_minutes)) * 60_000;
}
