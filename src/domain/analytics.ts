import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type {
  AnalyticsGrain,
  AnalyticsRange,
  AnalyticsSummary,
  AppSnapshot,
  DayTimelineCell,
  DayTimelineCellState,
  FocusSessionRecord,
  Id,
  LocalDate,
  ReviewDetailEntry,
  SessionReviewRecord,
} from "../types";
import { focusStatusLabelId } from "../defaults";
import { computeStartupDelayForArrival } from "./startup-delay";
import {
  getLocalDateEndUtcMs,
  getLocalDateStartUtcMs,
  getZonedDateTimeParts,
  normalizeTimeZone,
} from "./time";

const dayTimelineSlotMinutes = 5;
const dayTimelineSlotSeconds = dayTimelineSlotMinutes * 60;
const dayTimelineSlotMs = dayTimelineSlotSeconds * 1_000;
const dayTimelineHours = 24;
const dayTimelineSlotsPerHour = 60 / dayTimelineSlotMinutes;
const dayTimelineCellCount = dayTimelineHours * dayTimelineSlotsPerHour;
const dayTimelineMs = dayTimelineHours * 60 * 60 * 1_000;
const timelineStates = ["empty", "startup_delay", "break", "focus", "blocked"] as const;
const timelineLayerPriority: Record<DayTimelineCellState, number> = {
  empty: 0,
  startup_delay: 1,
  break: 2,
  focus: 3,
  blocked: 4,
};
const timelineTiePriority: Record<DayTimelineCellState, number> = {
  empty: 0,
  break: 1,
  startup_delay: 2,
  focus: 3,
  blocked: 4,
};
type TimelineStateRange = {
  startMs: number;
  endMs: number;
  state: DayTimelineCellState;
};

type TimelineDurationMap = Record<DayTimelineCellState, number>;

function createTimelineDurationMap(): TimelineDurationMap {
  return {
    empty: 0,
    startup_delay: 0,
    break: 0,
    focus: 0,
    blocked: 0,
  };
}

export function getAnalyticsRange(
  grain: AnalyticsGrain,
  anchorDate: Date = new Date(),
): AnalyticsRange {
  if (grain === "day") {
    const date = format(anchorDate, "yyyy-MM-dd");
    return { startDate: date, endDate: date, grain };
  }

  if (grain === "week") {
    return {
      startDate: format(startOfWeek(anchorDate, { weekStartsOn: 1 }), "yyyy-MM-dd"),
      endDate: format(endOfWeek(anchorDate, { weekStartsOn: 1 }), "yyyy-MM-dd"),
      grain,
    };
  }

  return {
    startDate: format(startOfMonth(anchorDate), "yyyy-MM-dd"),
    endDate: format(endOfMonth(anchorDate), "yyyy-MM-dd"),
    grain,
  };
}

export function buildAnalyticsSummary(
  snapshot: AppSnapshot,
  range: AnalyticsRange,
  now: Date = new Date(),
): AnalyticsSummary {
  const reviewedFocusSessions = snapshot.focusSessions.filter(
    (session) =>
      session.state === "reviewed" &&
      !session.deleted_at &&
      isDateInRange(session.local_date, range),
  );
  const reviewedFocusIds = new Set(reviewedFocusSessions.map((session) => session.id));
  const reviews = snapshot.sessionReviews.filter(
    (review) => reviewedFocusIds.has(review.focus_session_id) && !review.deleted_at,
  );
  const reviewIds = new Set(reviews.map((review) => review.id));
  const reviewLabels = snapshot.sessionReviewLabels.filter((relation) =>
    reviewIds.has(relation.review_id),
  );
  const rangeArrivalSessions = snapshot.arrivalSessions.filter(
    (arrival) => !arrival.deleted_at && isDateInRange(arrival.local_date, range),
  );
  const startupResults = rangeArrivalSessions.map((arrival) =>
    computeStartupDelayForArrival(arrival, snapshot.focusSessions),
  );
  const sleepLogs = snapshot.sleepLogs.filter(
    (sleep) => !sleep.deleted_at && isDateInRange(sleep.local_date, range),
  );
  const trend = buildTrend(range, reviewedFocusSessions, reviews, snapshot, now);

  const totalFocusMinutes = trend.reduce(
    (sum, day) => sum + day.focusMinutes,
    0,
  );
  const totalBlockedMinutes = trend.reduce(
    (sum, day) => sum + day.blockedMinutes,
    0,
  );
  const totalStartupDelayMinutes = trend.reduce(
    (sum, day) => sum + day.startupDelayMinutes,
    0,
  );
  const activeDelayDayCount = trend.filter(
    (day) => day.startupDelayMinutes > 0,
  ).length;
  const totalAttentionSwitchCount = reviews.reduce(
    (sum, review) => sum + review.attention_switch_count,
    0,
  );

  const statusCounts = countById(reviews.map((review) => review.status_label_id));
  const productLabelCounts = countById(
    reviewLabels
      .filter((relation) => relation.label_type === "product")
      .map((relation) => relation.label_id),
  );
  const blockerLabelCounts = countById(
    reviewLabels
      .filter((relation) => relation.label_type === "blocker")
      .map((relation) => relation.label_id),
  );

  return {
    range,
    totalFocusMinutes,
    totalBlockedMinutes,
    totalStartupDelayMinutes,
    averageStartupDelayMinutes:
      activeDelayDayCount > 0 ? totalStartupDelayMinutes / activeDelayDayCount : null,
    totalAttentionSwitchCount,
    attentionSwitchesPerFocusHour:
      totalFocusMinutes > 0
        ? totalAttentionSwitchCount / (totalFocusMinutes / 60)
        : null,
    statusCounts,
    productLabelCounts,
    blockerLabelCounts,
    averageSleepDurationMinutes:
      sleepLogs.length > 0
        ? sleepLogs.reduce((sum, sleep) => sum + sleep.sleep_duration_minutes, 0) /
          sleepLogs.length
        : null,
    averageEnergyScore:
      sleepLogs.length > 0
        ? sleepLogs.reduce((sum, sleep) => sum + sleep.energy_score, 0) /
          sleepLogs.length
        : null,
    trend,
    reviewEntries: buildReviewEntries(
      reviewedFocusSessions,
      reviews,
      reviewLabels,
      snapshot,
    ),
    notStartedArrivalCount: startupResults.filter(
      (result) => result.status !== "started",
    ).length,
  };
}

export function buildDayTimeline(
  snapshot: AppSnapshot,
  localDate: LocalDate,
  now: Date = new Date(),
): DayTimelineCell[] {
  const cellStateRanges: Array<TimelineStateRange[] | undefined> = Array.from({
    length: dayTimelineCellCount,
  });
  const liveCellEndMs: Array<number | undefined> = Array.from({
    length: dayTimelineCellCount,
  });
  const cells: DayTimelineCell[] = Array.from({ length: dayTimelineCellCount }, (_, index) => {
    const hour = Math.floor(index / dayTimelineSlotsPerHour);
    const slot = index % dayTimelineSlotsPerHour;
    const minuteOfDay = hour * 60 + slot * dayTimelineSlotMinutes;
    const timeLabel = formatMinuteOfDay(minuteOfDay);

    return {
      id: `${localDate}-${hour}-${slot}`,
      hour,
      slot,
      minuteOfDay,
      timeLabel,
      state: "empty" as const,
      durationMsByState: createTimelineDurationMap(),
      parts: [{ state: "empty" as const, startRatio: 0, endRatio: 1 }],
      title: `${timeLabel} 空白`,
    };
  });

  const timelineFocusSessions = snapshot.focusSessions.filter(
    (session) =>
      session.state !== "canceled" &&
      !session.deleted_at,
  );
  const timelineFocusIds = new Set(timelineFocusSessions.map((session) => session.id));
  const reviews = snapshot.sessionReviews.filter(
    (review) => timelineFocusIds.has(review.focus_session_id) && !review.deleted_at,
  );
  const reviewByFocusId = new Map(
    reviews.map((review) => [review.focus_session_id, review]),
  );

  snapshot.arrivalSessions
    .filter((arrival) => !arrival.deleted_at)
    .forEach((arrival) => {
      markTimelineSegment(
        cellStateRanges,
        liveCellEndMs,
        localDate,
        arrival.arrived_at,
        arrival.left_at ?? now.toISOString(),
        "startup_delay",
        arrival.time_zone,
        { isLive: !arrival.left_at },
      );
    });

  snapshot.breakSessions
    .filter(
      (session) =>
        session.state !== "canceled",
    )
    .forEach((session) => {
      const start = new Date(session.started_at);
      const { end, isLive } = getTimelineBreakDisplay(session, start, now);

      markTimelineSegment(
        cellStateRanges,
        liveCellEndMs,
        localDate,
        session.started_at,
        end,
        "break",
        session.time_zone,
        { isLive },
      );
    });

  timelineFocusSessions.forEach((session) => {
    const review = reviewByFocusId.get(session.id);
    const state =
      session.state === "reviewed" &&
      isNonFocusReview(review)
        ? "blocked"
        : "focus";
    const segments = snapshot.focusSegments
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

    if (segments.length > 0) {
      let remainingFocusBudgetMs = getPlannedFocusBudgetMs(session);

      segments.forEach((segment) => {
        const end = getTimelineFocusSegmentEnd(segment, now);
        if (!end || remainingFocusBudgetMs <= 0) {
          return;
        }

        const startMs = new Date(segment.started_at).getTime();
        const endMs = new Date(end).getTime();
        const cappedEndMs = Math.min(endMs, startMs + remainingFocusBudgetMs);
        if (cappedEndMs <= startMs) {
          return;
        }

        remainingFocusBudgetMs -= cappedEndMs - startMs;

        const isLiveSegment =
          segment.state === "running" && cappedEndMs === now.getTime();

        markTimelineSegment(
          cellStateRanges,
          liveCellEndMs,
          localDate,
          segment.started_at,
          new Date(cappedEndMs).toISOString(),
          state,
          segment.time_zone ?? session.time_zone,
          { isLive: isLiveSegment },
        );
      });
      return;
    }

    const start = new Date(session.started_at);
    const end = getTimelineFocusFallbackEnd(session, start, now);
    if (!end) {
      return;
    }

    markTimelineSegment(
      cellStateRanges,
      liveCellEndMs,
      localDate,
      session.started_at,
      end,
      state,
      session.time_zone,
      { isLive: session.state === "running" && end === now.toISOString() },
    );
  });

  applyCellRangesToTimelineCells(cells, cellStateRanges, liveCellEndMs);

  return cells;
}

function buildTrend(
  range: AnalyticsRange,
  focusSessions: FocusSessionRecord[],
  reviews: SessionReviewRecord[],
  snapshot: AppSnapshot,
  now: Date,
): AnalyticsSummary["trend"] {
  const days = eachDayOfInterval({
    start: parseISO(range.startDate),
    end: parseISO(range.endDate),
  }).map((date) => format(date, "yyyy-MM-dd"));
  const reviewByFocusId = new Map(
    reviews.map((review) => [review.focus_session_id, review]),
  );

  return days.map((date) => {
    const dayFocusSessions = focusSessions.filter(
      (session) => session.local_date === date,
    );
    const dayTimeline = buildDayTimeline(snapshot, date, now);
    const durationMsByState = sumTimelineCellDurations(dayTimeline);
    const daySleep = snapshot.sleepLogs.find(
      (sleep) => sleep.local_date === date && !sleep.deleted_at,
    );

    return {
      date,
      focusMinutes: minutesFromTimelineDuration(durationMsByState.focus),
      blockedMinutes: minutesFromTimelineDuration(durationMsByState.blocked),
      startupDelayMinutes: minutesFromTimelineDuration(
        durationMsByState.startup_delay,
      ),
      attentionSwitchCount: dayFocusSessions.reduce((sum, session) => {
        return sum + (reviewByFocusId.get(session.id)?.attention_switch_count ?? 0);
      }, 0),
      sleepDurationHours: daySleep
        ? Math.round((daySleep.sleep_duration_minutes / 60) * 10) / 10
        : undefined,
      energyScore: daySleep?.energy_score,
    };
  });
}

function buildReviewEntries(
  focusSessions: FocusSessionRecord[],
  reviews: SessionReviewRecord[],
  reviewLabels: AppSnapshot["sessionReviewLabels"],
  snapshot: AppSnapshot,
): ReviewDetailEntry[] {
  const focusById = new Map(focusSessions.map((session) => [session.id, session]));
  const labelById = new Map(snapshot.labels.map((label) => [label.id, label]));

  return reviews
    .map((review) => {
      const focus = focusById.get(review.focus_session_id);
      const productRelations = reviewLabels.filter(
        (relation) =>
          relation.review_id === review.id && relation.label_type === "product",
      );
      const blockerRelations = reviewLabels.filter(
        (relation) =>
          relation.review_id === review.id && relation.label_type === "blocker",
      );
      const productLabelIds = productRelations.map((relation) => relation.label_id);
      const productLabelNames = productLabelIds
        .map((labelId) => labelById.get(labelId)?.name)
        .filter((name): name is string => Boolean(name));
      const blockerLabelIds = blockerRelations.map((relation) => relation.label_id);
      const blockerLabelNames = blockerLabelIds
        .map((labelId) => labelById.get(labelId)?.name)
        .filter((name): name is string => Boolean(name));
      const statusLabel = labelById.get(review.status_label_id);

      return {
        id: review.id,
        focusSessionId: review.focus_session_id,
        local_date: focus?.local_date ?? review.created_at.slice(0, 10),
        completed_at: focus?.completed_at,
        focusMinutes: focus?.actual_duration_minutes ?? 0,
        statusLabelId: review.status_label_id,
        statusLabelName: statusLabel?.name ?? "未标记状态",
        productLabelIds,
        productLabelNames,
        blockerLabelIds,
        blockerLabelNames,
        productNote: review.product_note?.trim() || undefined,
        blockerNote: review.blocker_note?.trim() || undefined,
        attentionSwitchCount: review.attention_switch_count,
      };
    })
    .sort((a, b) => {
      const bTime = b.completed_at ?? b.local_date;
      const aTime = a.completed_at ?? a.local_date;
      return bTime.localeCompare(aTime);
    });
}

function isDateInRange(date: LocalDate, range: AnalyticsRange): boolean {
  return date >= range.startDate && date <= range.endDate;
}

function markTimelineSegment(
  cellStateRanges: Array<TimelineStateRange[] | undefined>,
  liveCellEndMs: Array<number | undefined>,
  localDate: LocalDate,
  startIso: string,
  endIso: string,
  state: Exclude<DayTimelineCellState, "empty">,
  timeZone = normalizeTimeZone(),
  options: { isLive?: boolean } = {},
) {
  const zone = normalizeTimeZone(timeZone);
  const start = new Date(startIso);
  const end = new Date(endIso);
  const dayStartMs = getLocalDateStartUtcMs(localDate, zone);
  const dayEndMs = getLocalDateEndUtcMs(localDate, zone);
  const startMs = Math.max(start.getTime(), dayStartMs);
  const endMs = Math.min(end.getTime(), dayEndMs);

  if (endMs <= startMs) {
    return;
  }

  const startOffsetMs =
    startMs <= dayStartMs ? 0 : getLocalMillisecondOfDay(new Date(startMs), zone);
  const endOffsetMs =
    endMs >= dayEndMs ? dayTimelineMs : getLocalMillisecondOfDay(new Date(endMs), zone);
  if (endOffsetMs <= startOffsetMs) {
    return;
  }

  getTimelineCellOverlaps(startOffsetMs, endOffsetMs).forEach((overlap) => {
    overlayTimelineCellRange(
      cellStateRanges,
      overlap.cellIndex,
      overlap.startMs,
      overlap.endMs,
      state,
    );

    if (options.isLive) {
      liveCellEndMs[overlap.cellIndex] = Math.max(
        liveCellEndMs[overlap.cellIndex] ?? 0,
        overlap.endMs,
      );
    }
  });
}

function getTimelineBreakDisplay(
  session: AppSnapshot["breakSessions"][number],
  start: Date,
  now: Date,
): { end: string; isLive: boolean } {
  const plannedEnd = new Date(
    start.getTime() +
      Math.max(0, Math.round(session.planned_duration_minutes)) * 60_000,
  );

  if (session.state === "running") {
    const cappedEndMs = Math.min(now.getTime(), plannedEnd.getTime());
    return {
      end: new Date(cappedEndMs).toISOString(),
      isLive: cappedEndMs === now.getTime(),
    };
  }

  if (session.state === "completed" && !session.ended_early) {
    const durationMinutes =
      typeof session.actual_duration_minutes === "number"
        ? session.actual_duration_minutes
        : session.planned_duration_minutes;
    const displayDurationMinutes = Math.max(0, Math.round(durationMinutes));
    return {
      end: new Date(start.getTime() + displayDurationMinutes * 60_000).toISOString(),
      isLive: false,
    };
  }

  return { end: session.completed_at ?? plannedEnd.toISOString(), isLive: false };
}

function getTimelineFocusSegmentEnd(
  segment: AppSnapshot["focusSegments"][number],
  now: Date,
): string | null {
  if (segment.state === "completed") {
    return segment.ended_at ?? null;
  }

  if (segment.state === "running") {
    return now.toISOString();
  }

  return null;
}

function getTimelineFocusFallbackEnd(
  session: FocusSessionRecord,
  start: Date,
  now: Date,
): string | null {
  if (session.state === "running") {
    const plannedEnd = new Date(
      start.getTime() +
        getPlannedFocusBudgetMs(session) +
        session.paused_total_seconds * 1_000,
    );
    return new Date(Math.min(now.getTime(), plannedEnd.getTime())).toISOString();
  }

  if (session.state === "paused") {
    return session.current_pause_started_at ?? null;
  }

  if (typeof session.actual_duration_minutes === "number") {
    const end = new Date(start);
    end.setMinutes(start.getMinutes() + session.actual_duration_minutes);
    return end.toISOString();
  }

  return session.completed_at ?? null;
}

function getPlannedFocusBudgetMs(session: FocusSessionRecord): number {
  return Math.max(0, Math.round(session.planned_duration_minutes)) * 60_000;
}

function applyCellRangesToTimelineCells(
  cells: DayTimelineCell[],
  cellStateRanges: Array<TimelineStateRange[] | undefined>,
  liveCellEndMs: Array<number | undefined>,
) {
  cells.forEach((cell, index) => {
    const summary = summarizeTimelineCell(
      cellStateRanges[index],
      liveCellEndMs[index] ?? dayTimelineSlotMs,
    );
    cell.state = summary.state;
    cell.durationMsByState = summary.durationMsByState;
    cell.parts = summary.parts;
    cell.title = formatTimelineCellTitle(cell.timeLabel, summary.durationMsByState);
  });
}

function getLocalMillisecondOfDay(date: Date, timeZone: string): number {
  const parts = getZonedDateTimeParts(date, timeZone);
  return (
    ((parts.hour * 60 + parts.minute) * 60 + parts.second) * 1_000 +
    date.getMilliseconds()
  );
}

function summarizeTimelineCell(
  ranges: TimelineStateRange[] | undefined,
  observedEndMs: number,
): {
  state: DayTimelineCellState;
  durationMsByState: TimelineDurationMap;
  parts: DayTimelineCell["parts"];
} {
  const safeObservedEndMs = Math.max(0, Math.min(dayTimelineSlotMs, observedEndMs));
  const durationMsByState = createTimelineDurationMap();

  if (!ranges) {
    durationMsByState.empty = safeObservedEndMs;
    return {
      state: "empty",
      durationMsByState,
      parts: [{ state: "empty", startRatio: 0, endRatio: 1 }],
    };
  }

  const parts: DayTimelineCell["parts"] = [];

  ranges.forEach((range) => {
    const overlapStartMs = Math.max(0, range.startMs);
    const overlapEndMs = Math.min(safeObservedEndMs, range.endMs);
    const durationMs = Math.max(0, overlapEndMs - overlapStartMs);
    if (durationMs <= 0) {
      return;
    }

    durationMsByState[range.state] += durationMs;
    parts.push({
      state: range.state,
      startRatio: overlapStartMs / dayTimelineSlotMs,
      endRatio: overlapEndMs / dayTimelineSlotMs,
    });
  });

  if (safeObservedEndMs < dayTimelineSlotMs) {
    parts.push({
      state: "empty",
      startRatio: safeObservedEndMs / dayTimelineSlotMs,
      endRatio: 1,
    });
  }

  const state = timelineStates.reduce<DayTimelineCellState>((winner, state) => {
    if (durationMsByState[state] > durationMsByState[winner]) {
      return state;
    }

    if (
      durationMsByState[state] === durationMsByState[winner] &&
      timelineTiePriority[state] > timelineTiePriority[winner]
    ) {
      return state;
    }

    return winner;
  }, "empty");

  return {
    state,
    durationMsByState,
    parts: parts.length > 0 ? mergeTimelineParts(parts) : [
      { state: "empty", startRatio: 0, endRatio: 1 },
    ],
  };
}

function mergeTimelineParts(parts: DayTimelineCell["parts"]): DayTimelineCell["parts"] {
  return parts.reduce<DayTimelineCell["parts"]>((merged, part) => {
    const previous = merged.at(-1);
    if (
      previous &&
      previous.state === part.state &&
      Math.abs(previous.endRatio - part.startRatio) < 0.0001
    ) {
      previous.endRatio = part.endRatio;
      return merged;
    }

    merged.push(part);
    return merged;
  }, []);
}

export function sumTimelineCellDurations(
  cells: DayTimelineCell[],
): TimelineDurationMap {
  return cells.reduce<TimelineDurationMap>((result, cell) => {
    timelineStates.forEach((state) => {
      result[state] += cell.durationMsByState[state] ?? 0;
    });

    return result;
  }, createTimelineDurationMap());
}

function minutesFromTimelineDuration(durationMs: number): number {
  return Math.round(durationMs / 60_000);
}

function formatTimelineCellTitle(
  timeLabel: string,
  durationMsByState: TimelineDurationMap,
): string {
  const parts = timelineStates
    .filter((state) => state !== "empty" && durationMsByState[state] > 0)
    .map((state) => `${timelineStateLabel(state)} ${formatTimelineDuration(durationMsByState[state])}`);

  if (parts.length === 0) {
    return `${timeLabel} 空白`;
  }

  return `${timeLabel} ${parts.join("，")}`;
}

function formatTimelineDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (seconds === 0) {
    return `${minutes} 分钟`;
  }

  return `${minutes} 分 ${seconds} 秒`;
}

function getTimelineCellOverlaps(startOffsetMs: number, endOffsetMs: number) {
  const startCell = Math.max(0, Math.floor(startOffsetMs / dayTimelineSlotMs));
  const endCell = Math.min(
    dayTimelineCellCount - 1,
    Math.floor((endOffsetMs - 1) / dayTimelineSlotMs),
  );
  const overlaps: Array<{
    cellIndex: number;
    startMs: number;
    endMs: number;
    durationMs: number;
  }> = [];

  for (let cellIndex = startCell; cellIndex <= endCell; cellIndex += 1) {
    const cellStartMs = cellIndex * dayTimelineSlotMs;
    const cellEndMs = cellStartMs + dayTimelineSlotMs;
    const startMs = Math.max(startOffsetMs, cellStartMs) - cellStartMs;
    const endMs = Math.min(endOffsetMs, cellEndMs) - cellStartMs;
    if (endMs > startMs) {
      overlaps.push({
        cellIndex,
        startMs,
        endMs,
        durationMs: endMs - startMs,
      });
    }
  }

  return overlaps;
}

function overlayTimelineCellRange(
  cellStateRanges: Array<TimelineStateRange[] | undefined>,
  cellIndex: number,
  startMs: number,
  endMs: number,
  state: Exclude<DayTimelineCellState, "empty">,
) {
  const existingRanges = cellStateRanges[cellIndex] ?? [
    { startMs: 0, endMs: dayTimelineSlotMs, state: "empty" as const },
  ];
  const nextRanges: TimelineStateRange[] = [];

  existingRanges.forEach((range) => {
    if (range.endMs <= startMs || range.startMs >= endMs) {
      nextRanges.push(range);
      return;
    }

    if (shouldKeepTimelineState(range.state, state)) {
      nextRanges.push(range);
      return;
    }

    if (range.startMs < startMs) {
      nextRanges.push({ ...range, endMs: startMs });
    }

    nextRanges.push({
      startMs: Math.max(range.startMs, startMs),
      endMs: Math.min(range.endMs, endMs),
      state,
    });

    if (range.endMs > endMs) {
      nextRanges.push({ ...range, startMs: endMs });
    }
  });

  cellStateRanges[cellIndex] = mergeAdjacentTimelineRanges(nextRanges);
}

function mergeAdjacentTimelineRanges(ranges: TimelineStateRange[]) {
  return ranges.reduce<TimelineStateRange[]>((merged, range) => {
    const previous = merged.at(-1);
    if (previous && previous.state === range.state && previous.endMs === range.startMs) {
      previous.endMs = range.endMs;
      return merged;
    }

    merged.push(range);
    return merged;
  }, []);
}

function shouldKeepTimelineState(
  currentState: DayTimelineCellState,
  nextState: Exclude<DayTimelineCellState, "empty">,
): boolean {
  return timelineLayerPriority[currentState] > timelineLayerPriority[nextState];
}

function isNonFocusReview(review: SessionReviewRecord | undefined): boolean {
  if (!review) {
    return false;
  }

  return review.status_label_id !== focusStatusLabelId;
}

function formatMinuteOfDay(minuteOfDay: number): string {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function timelineStateLabel(state: DayTimelineCellState): string {
  if (state === "startup_delay") {
    return "拖延";
  }

  if (state === "break") {
    return "休息";
  }

  if (state === "blocked") {
    return "不专注";
  }

  if (state === "focus") {
    return "专注";
  }

  return "空白";
}

function countById(ids: Id[]): Record<Id, number> {
  return ids.reduce<Record<Id, number>>((counts, id) => {
    counts[id] = (counts[id] ?? 0) + 1;
    return counts;
  }, {});
}
