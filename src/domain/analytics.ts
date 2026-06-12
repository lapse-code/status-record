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

const dayTimelineSlotMinutes = 5;
const dayTimelineHours = 24;
const dayTimelineSlotsPerHour = 60 / dayTimelineSlotMinutes;
const dayTimelineMinutes = dayTimelineHours * 60;
const timelineStates = ["empty", "startup_delay", "focus", "blocked"] as const;
const timelineStatePriority: Record<DayTimelineCellState, number> = {
  empty: 0,
  startup_delay: 1,
  focus: 2,
  blocked: 3,
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
): DayTimelineCell[] {
  const minuteStates: DayTimelineCellState[] =
    Array<DayTimelineCellState>(dayTimelineMinutes).fill("empty");
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

  const reviewedFocusSessions = snapshot.focusSessions.filter(
    (session) =>
      session.state === "reviewed" &&
      !session.deleted_at &&
      session.local_date === localDate,
  );
  const reviewedFocusIds = new Set(reviewedFocusSessions.map((session) => session.id));
  const reviews = snapshot.sessionReviews.filter(
    (review) => reviewedFocusIds.has(review.focus_session_id) && !review.deleted_at,
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
    .filter((arrival) => !arrival.deleted_at && arrival.local_date === localDate)
    .forEach((arrival) => {
      const startup = computeStartupDelayForArrival(arrival, snapshot.focusSessions);
      if (startup.status !== "started" || !startup.firstFocusSessionId) {
        return;
      }

      const firstFocus = snapshot.focusSessions.find(
        (session) => session.id === startup.firstFocusSessionId,
      );
      if (!firstFocus) {
        return;
      }

      markTimelineSegment(
        minuteStates,
        localDate,
        arrival.arrived_at,
        firstFocus.started_at,
        "startup_delay",
      );
    });

  reviewedFocusSessions.forEach((session) => {
    const review = reviewByFocusId.get(session.id);
    const state = isBlockedFocusReview(review, reviewLabels, labelById)
      ? "blocked"
      : "focus";
    const start = new Date(session.started_at);
    const end = new Date(start);
    end.setMinutes(start.getMinutes() + (session.actual_duration_minutes ?? 0));

    markTimelineSegment(
      minuteStates,
      localDate,
      session.started_at,
      end.toISOString(),
      state,
    );
  });

  applyMinuteStatesToTimelineCells(cells, minuteStates);

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
  minuteStates: DayTimelineCellState[],
  localDate: LocalDate,
  startIso: string,
  endIso: string,
  state: Exclude<DayTimelineCellState, "empty">,
) {
  const segment = clampSegmentToLocalDate(startIso, endIso, localDate);
  if (!segment) {
    return;
  }

  const endIndex = Math.min(
    minuteStates.length,
    segment.endMinute,
  );

  for (let index = segment.startMinute; index < endIndex; index += 1) {
    const currentState = minuteStates[index];
    if (!currentState || shouldKeepTimelineState(currentState, state)) {
      continue;
    }

    minuteStates[index] = state;
  }
}

function applyMinuteStatesToTimelineCells(
  cells: DayTimelineCell[],
  minuteStates: DayTimelineCellState[],
) {
  cells.forEach((cell) => {
    const statesInCell = minuteStates.slice(
      cell.minuteOfDay,
      cell.minuteOfDay + dayTimelineSlotMinutes,
    );
    const state = selectTimelineCellState(statesInCell);
    cell.state = state;
    cell.title = `${cell.timeLabel} ${timelineStateLabel(state)}`;
  });
}

function selectTimelineCellState(states: DayTimelineCellState[]) {
  const counts: Record<DayTimelineCellState, number> = {
    empty: 0,
    startup_delay: 0,
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
      timelineStatePriority[state] > timelineStatePriority[winner]
    ) {
      return state;
    }

    return winner;
  }, "empty");
}

function clampSegmentToLocalDate(
  startIso: string,
  endIso: string,
  localDate: LocalDate,
): { startMinute: number; endMinute: number } | null {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const dayStart = new Date(`${localDate}T00:00:00`);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayStart.getDate() + 1);

  const startMs = Math.max(start.getTime(), dayStart.getTime());
  const endMs = Math.min(end.getTime(), dayEnd.getTime());

  if (endMs <= startMs) {
    return null;
  }

  return {
    startMinute: Math.floor((startMs - dayStart.getTime()) / 60_000),
    endMinute: Math.ceil((endMs - dayStart.getTime()) / 60_000),
  };
}

function shouldKeepTimelineState(
  currentState: DayTimelineCellState,
  nextState: Exclude<DayTimelineCellState, "empty">,
): boolean {
  return timelineStatePriority[currentState] > timelineStatePriority[nextState];
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
    return "启动延迟";
  }

  if (state === "blocked") {
    return "阻塞/被打断";
  }

  if (state === "focus") {
    return "正常学习";
  }

  return "空白";
}

function countById(ids: Id[]): Record<Id, number> {
  return ids.reduce<Record<Id, number>>((counts, id) => {
    counts[id] = (counts[id] ?? 0) + 1;
    return counts;
  }, {});
}
