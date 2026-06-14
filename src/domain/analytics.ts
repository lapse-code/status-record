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
import { computeStartupDelayForArrival } from "./startup-delay";
import {
  getLocalDateEndUtcMs,
  getLocalDateStartUtcMs,
  getZonedDateTimeParts,
  normalizeTimeZone,
  toLocalDate,
} from "./time";

const dayTimelineSlotMinutes = 5;
const dayTimelineSlotSeconds = dayTimelineSlotMinutes * 60;
const dayTimelineHours = 24;
const dayTimelineSlotsPerHour = 60 / dayTimelineSlotMinutes;
const dayTimelineSeconds = dayTimelineHours * 60 * 60;
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
  const startupDelays = startupResults
    .map((result) => result.startupDelayMinutes)
    .filter((minutes): minutes is number => typeof minutes === "number");
  const sleepLogs = snapshot.sleepLogs.filter(
    (sleep) => !sleep.deleted_at && isDateInRange(sleep.local_date, range),
  );

  const totalFocusMinutes = reviewedFocusSessions.reduce(
    (sum, session) => sum + (session.actual_duration_minutes ?? 0),
    0,
  );
  const totalStartupDelayMinutes = startupDelays.reduce(
    (sum, minutes) => sum + minutes,
    0,
  );
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
    totalStartupDelayMinutes,
    averageStartupDelayMinutes:
      startupDelays.length > 0 ? totalStartupDelayMinutes / startupDelays.length : null,
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
    trend: buildTrend(range, reviewedFocusSessions, reviews, snapshot),
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
  const secondStates: DayTimelineCellState[] =
    Array<DayTimelineCellState>(dayTimelineSeconds).fill("empty");
  const cells: DayTimelineCell[] = Array.from({ length: dayTimelineHours * dayTimelineSlotsPerHour }, (_, index) => {
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
  const reviewIds = new Set(reviews.map((review) => review.id));
  const reviewLabels = snapshot.sessionReviewLabels.filter((relation) =>
    reviewIds.has(relation.review_id),
  );
  const labelById = new Map(snapshot.labels.map((label) => [label.id, label]));

  snapshot.arrivalSessions
    .filter((arrival) => !arrival.deleted_at)
    .forEach((arrival) => {
      markTimelineSegment(
        secondStates,
        localDate,
        arrival.arrived_at,
        arrival.left_at ?? now.toISOString(),
        "startup_delay",
        arrival.time_zone,
      );
    });

  snapshot.breakSessions
    .filter(
      (session) =>
        session.state !== "canceled",
    )
    .forEach((session) => {
      const start = new Date(session.started_at);
      const end = getTimelineBreakEnd(session, start, now);

      markTimelineSegment(
        secondStates,
        localDate,
        session.started_at,
        end,
        "break",
        session.time_zone,
      );
    });

  timelineFocusSessions.forEach((session) => {
    const review = reviewByFocusId.get(session.id);
    const state =
      session.state === "reviewed" &&
      isBlockedFocusReview(review, reviewLabels, labelById)
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

        markTimelineSegment(
          secondStates,
          localDate,
          segment.started_at,
          new Date(cappedEndMs).toISOString(),
          state,
          segment.time_zone ?? session.time_zone,
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
      secondStates,
      localDate,
      session.started_at,
      end,
      state,
      session.time_zone,
    );
  });

  applySecondStatesToTimelineCells(cells, secondStates);

  return cells;
}

function buildTrend(
  range: AnalyticsRange,
  focusSessions: FocusSessionRecord[],
  reviews: SessionReviewRecord[],
  snapshot: AppSnapshot,
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
    const dayArrivalSessions = snapshot.arrivalSessions.filter(
      (arrival) => arrival.local_date === date && !arrival.deleted_at,
    );
    const startupDelayMinutes = dayArrivalSessions
      .map((arrival) =>
        computeStartupDelayForArrival(arrival, snapshot.focusSessions)
          .startupDelayMinutes ?? 0,
      )
      .reduce((sum, minutes) => sum + minutes, 0);
    const daySleep = snapshot.sleepLogs.find(
      (sleep) => sleep.local_date === date && !sleep.deleted_at,
    );

    return {
      date,
      focusMinutes: dayFocusSessions.reduce(
        (sum, session) => sum + (session.actual_duration_minutes ?? 0),
        0,
      ),
      startupDelayMinutes,
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
  secondStates: DayTimelineCellState[],
  localDate: LocalDate,
  startIso: string,
  endIso: string,
  state: Exclude<DayTimelineCellState, "empty">,
  timeZone = normalizeTimeZone(),
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

  const firstSecondMs = Math.ceil(startMs / 1_000) * 1_000;
  for (let ms = firstSecondMs; ms < endMs; ms += 1_000) {
    const secondDate = new Date(ms);
    if (toLocalDate(secondDate, zone) !== localDate) {
      continue;
    }

    const index = getLocalSecondOfDay(secondDate, zone);
    if (index < 0 || index >= secondStates.length) {
      continue;
    }

    const currentState = secondStates[index];
    if (!currentState || shouldKeepTimelineState(currentState, state)) {
      continue;
    }

    secondStates[index] = state;
  }
}

function getTimelineBreakEnd(
  session: AppSnapshot["breakSessions"][number],
  start: Date,
  now: Date,
): string {
  const plannedEnd = new Date(
    start.getTime() +
      Math.max(0, Math.round(session.planned_duration_minutes)) * 60_000,
  );

  if (session.state === "running") {
    return new Date(Math.min(now.getTime(), plannedEnd.getTime())).toISOString();
  }

  if (session.state === "completed" && !session.ended_early) {
    const durationMinutes =
      typeof session.actual_duration_minutes === "number"
        ? session.actual_duration_minutes
        : session.planned_duration_minutes;
    return new Date(
      start.getTime() + Math.max(0, Math.round(durationMinutes)) * 60_000,
    ).toISOString();
  }

  return session.completed_at ?? plannedEnd.toISOString();
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

function applySecondStatesToTimelineCells(
  cells: DayTimelineCell[],
  secondStates: DayTimelineCellState[],
) {
  cells.forEach((cell) => {
    const cellStartSecond = cell.minuteOfDay * 60;
    const statesInCell = secondStates.slice(
      cellStartSecond,
      cellStartSecond + dayTimelineSlotSeconds,
    );
    const state = selectTimelineCellState(statesInCell);
    cell.state = state;
    cell.title = `${cell.timeLabel} ${timelineStateLabel(state)}`;
  });
}

function getLocalSecondOfDay(date: Date, timeZone: string): number {
  const parts = getZonedDateTimeParts(date, timeZone);
  return parts.hour * 60 * 60 + parts.minute * 60 + parts.second;
}

function selectTimelineCellState(states: DayTimelineCellState[]) {
  const counts: Record<DayTimelineCellState, number> = {
    empty: 0,
    startup_delay: 0,
    break: 0,
    focus: 0,
    blocked: 0,
  };

  states.forEach((state) => {
    counts[state] += 1;
  });

  return timelineStates.reduce<DayTimelineCellState>((winner, state) => {
    if (counts[state] > counts[winner]) {
      return state;
    }

    if (
      counts[state] === counts[winner] &&
      timelineTiePriority[state] > timelineTiePriority[winner]
    ) {
      return state;
    }

    return winner;
  }, "empty");
}

function shouldKeepTimelineState(
  currentState: DayTimelineCellState,
  nextState: Exclude<DayTimelineCellState, "empty">,
): boolean {
  return timelineLayerPriority[currentState] > timelineLayerPriority[nextState];
}

function isBlockedFocusReview(
  review: SessionReviewRecord | undefined,
  reviewLabels: AppSnapshot["sessionReviewLabels"],
  labelById: Map<Id, AppSnapshot["labels"][number]>,
): boolean {
  if (!review) {
    return false;
  }

  const statusName = labelById.get(review.status_label_id)?.name ?? "";
  if (statusName.includes("被打断") || statusName.includes("卡住")) {
    return true;
  }

  return reviewLabels
    .filter(
      (relation) =>
        relation.review_id === review.id && relation.label_type === "blocker",
    )
    .some((relation) => {
      const label = labelById.get(relation.label_id);
      return label?.name !== "无";
    });
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
