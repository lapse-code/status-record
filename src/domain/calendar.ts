import type {
  AnalyticsRange,
  AppSnapshot,
  Id,
  LocalDate,
  TimeZoneId,
} from "../types";
import { getEffectiveFocusOverlapRanges } from "./focus-overlap";
import {
  fallbackTimeZone,
  getLocalDateEndUtcMs,
  getLocalDateStartUtcMs,
  getZonedDateTimeParts,
  normalizeTimeZone,
} from "./time";

export type CalendarLabel = {
  id: Id;
  name: string;
  color?: string;
};

export type CalendarEntry = {
  id: Id;
  reviewId: Id;
  focusSessionId: Id;
  localDate: LocalDate;
  timeZone: TimeZoneId;
  startIso: string;
  endIso: string;
  startMinuteOfDay: number;
  endMinuteOfDay: number;
  startTimeLabel: string;
  endTimeLabel: string;
  durationMinutes: number;
  statusLabel: CalendarLabel;
  productLabels: CalendarLabel[];
  blockerLabels: CalendarLabel[];
  productNote?: string;
  blockerNote?: string;
};

export function buildCalendarEntries(
  snapshot: AppSnapshot,
  range: Pick<AnalyticsRange, "startDate" | "endDate">,
): CalendarEntry[] {
  const labelById = new Map(snapshot.labels.map((label) => [label.id, label]));
  const reviewByFocusId = new Map(
    snapshot.sessionReviews
      .filter((review) => !review.deleted_at)
      .map((review) => [review.focus_session_id, review]),
  );
  const reviewLabelsByReviewId = groupReviewLabelsByReviewId(snapshot);
  const segmentsByFocusId = groupFocusSegmentsByFocusId(snapshot);

  return snapshot.focusSessions
    .filter((session) => session.state === "reviewed" && !session.deleted_at)
    .flatMap((session) => {
      const review = reviewByFocusId.get(session.id);
      if (!review) {
        return [];
      }

      const timeZone = normalizeTimeZone(session.time_zone ?? fallbackTimeZone);
      const effectiveRanges = getEffectiveFocusOverlapRanges(
        session,
        segmentsByFocusId.get(session.id) ?? [],
      );
      const reviewRelations = reviewLabelsByReviewId.get(review.id) ?? [];
      const productLabels = reviewRelations
        .filter((relation) => relation.label_type === "product")
        .map((relation) => labelToCalendarLabel(labelById.get(relation.label_id)))
        .filter((label): label is CalendarLabel => Boolean(label));
      const blockerLabels = reviewRelations
        .filter((relation) => relation.label_type === "blocker")
        .map((relation) => labelToCalendarLabel(labelById.get(relation.label_id)))
        .filter((label): label is CalendarLabel => Boolean(label));
      const statusLabel =
        labelToCalendarLabel(labelById.get(review.status_label_id)) ??
        ({
          id: review.status_label_id,
          name: "未标记状态",
        } satisfies CalendarLabel);

      return effectiveRanges.flatMap((effectiveRange, rangeIndex) =>
        splitEffectiveRangeByLocalDate(
          effectiveRange.startMs,
          effectiveRange.endMs,
          timeZone,
        )
          .filter((segment) => isLocalDateInRange(segment.localDate, range))
          .map((segment) => ({
            id: `${review.id}-${rangeIndex}-${segment.localDate}`,
            reviewId: review.id,
            focusSessionId: session.id,
            localDate: segment.localDate,
            timeZone,
            startIso: new Date(segment.startMs).toISOString(),
            endIso: new Date(segment.endMs).toISOString(),
            startMinuteOfDay: segment.startMinuteOfDay,
            endMinuteOfDay: segment.endMinuteOfDay,
            startTimeLabel: segment.startTimeLabel,
            endTimeLabel: segment.endTimeLabel,
            durationMinutes: Math.max(
              1,
              Math.round((segment.endMs - segment.startMs) / 60_000),
            ),
            statusLabel,
            productLabels,
            blockerLabels,
            productNote: review.product_note?.trim() || undefined,
            blockerNote: review.blocker_note?.trim() || undefined,
          })),
      );
    })
    .sort((a, b) => {
      const dateOrder = a.localDate.localeCompare(b.localDate);
      if (dateOrder !== 0) {
        return dateOrder;
      }

      return new Date(a.startIso).getTime() - new Date(b.startIso).getTime();
    });
}

export function groupCalendarProductLabelsByDate(
  entries: CalendarEntry[],
): Map<LocalDate, CalendarLabel[]> {
  const labelsByDate = new Map<LocalDate, CalendarLabel[]>();
  const seenByDate = new Map<LocalDate, Set<Id>>();

  entries.forEach((entry) => {
    const seen = seenByDate.get(entry.localDate) ?? new Set<Id>();
    const labels = labelsByDate.get(entry.localDate) ?? [];

    entry.productLabels.forEach((label) => {
      if (!seen.has(label.id)) {
        seen.add(label.id);
        labels.push(label);
      }
    });

    seenByDate.set(entry.localDate, seen);
    labelsByDate.set(entry.localDate, labels);
  });

  return labelsByDate;
}

function groupReviewLabelsByReviewId(snapshot: AppSnapshot) {
  const relationsByReviewId = new Map<Id, AppSnapshot["sessionReviewLabels"]>();
  snapshot.sessionReviewLabels.forEach((relation) => {
    const relations = relationsByReviewId.get(relation.review_id) ?? [];
    relations.push(relation);
    relationsByReviewId.set(relation.review_id, relations);
  });
  return relationsByReviewId;
}

function groupFocusSegmentsByFocusId(snapshot: AppSnapshot) {
  const segmentsByFocusId = new Map<Id, AppSnapshot["focusSegments"]>();
  snapshot.focusSegments.forEach((segment) => {
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

  return segmentsByFocusId;
}

function labelToCalendarLabel(
  label: AppSnapshot["labels"][number] | undefined,
): CalendarLabel | null {
  if (!label || label.deleted_at) {
    return null;
  }

  return {
    id: label.id,
    name: label.name,
    color: label.color,
  };
}

function splitEffectiveRangeByLocalDate(
  startMs: number,
  endMs: number,
  timeZone: string,
) {
  const startDate = getLocalDateForMs(startMs, timeZone);
  const endDate = getLocalDateForMs(Math.max(startMs, endMs - 1), timeZone);
  const dates = getLocalDatesBetween(startDate, endDate);

  return dates.flatMap((localDate) => {
    const dayStartMs = getLocalDateStartUtcMs(localDate, timeZone);
    const dayEndMs = getLocalDateEndUtcMs(localDate, timeZone);
    const segmentStartMs = Math.max(startMs, dayStartMs);
    const segmentEndMs = Math.min(endMs, dayEndMs);

    if (segmentEndMs <= segmentStartMs) {
      return [];
    }

    return [
      {
        localDate,
        startMs: segmentStartMs,
        endMs: segmentEndMs,
        startMinuteOfDay:
          segmentStartMs <= dayStartMs
            ? 0
            : getLocalMinuteOfDay(new Date(segmentStartMs), timeZone),
        endMinuteOfDay:
          segmentEndMs >= dayEndMs
            ? 24 * 60
            : getLocalMinuteOfDay(new Date(segmentEndMs), timeZone),
        startTimeLabel:
          segmentStartMs <= dayStartMs
            ? "00:00"
            : formatLocalTime(new Date(segmentStartMs), timeZone),
        endTimeLabel:
          segmentEndMs >= dayEndMs
            ? "24:00"
            : formatLocalTime(new Date(segmentEndMs), timeZone),
      },
    ];
  });
}

function getLocalDateForMs(ms: number, timeZone: string): LocalDate {
  const parts = getZonedDateTimeParts(new Date(ms), timeZone);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(
    2,
    "0",
  )}-${String(parts.day).padStart(2, "0")}`;
}

function getLocalDatesBetween(startDate: LocalDate, endDate: LocalDate): LocalDate[] {
  const dates: LocalDate[] = [];
  const current = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  while (current.getTime() <= end.getTime()) {
    dates.push(formatDateFromLocalDate(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

function getLocalMinuteOfDay(date: Date, timeZone: string): number {
  const parts = getZonedDateTimeParts(date, timeZone);
  return parts.hour * 60 + parts.minute + parts.second / 60;
}

function formatLocalTime(date: Date, timeZone: string): string {
  const parts = getZonedDateTimeParts(date, timeZone);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(
    2,
    "0",
  )}`;
}

function isLocalDateInRange(
  date: LocalDate,
  range: Pick<AnalyticsRange, "startDate" | "endDate">,
) {
  return date >= range.startDate && date <= range.endDate;
}

function formatDateFromLocalDate(date: Date): LocalDate {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;
}
