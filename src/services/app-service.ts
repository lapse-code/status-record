import { db, initializeDatabase } from "../storage/db";
import { demoDays } from "../demo-data";
import {
  calculateBreakBalance,
  calculateEarnedBreakMinutes,
  calculateUsedBreakMinutes,
} from "../domain/break-bank";
import { createId } from "../domain/id";
import { nowIso, secondsBetween, toLocalDate } from "../domain/time";
import type {
  AppSnapshot,
  BreakSessionRecord,
  FocusSessionRecord,
  Id,
  LabelRecord,
  LabelType,
  SleepLogRecord,
  SubmitSessionReviewInput,
} from "../types";

export async function loadSnapshot(): Promise<AppSnapshot> {
  await initializeDatabase();

  const [
    labels,
    arrivalSessions,
    focusSessions,
    sessionReviews,
    sessionReviewLabels,
    breakBankTransactions,
    breakSessions,
    sleepLogs,
    appSettings,
  ] = await Promise.all([
    db.labels.toArray(),
    db.arrival_sessions.toArray(),
    db.focus_sessions.toArray(),
    db.session_reviews.toArray(),
    db.session_review_labels.toArray(),
    db.break_bank_transactions.toArray(),
    db.break_sessions.toArray(),
    db.sleep_logs.toArray(),
    db.app_settings.toArray(),
  ]);

  return {
    labels,
    arrivalSessions,
    focusSessions,
    sessionReviews,
    sessionReviewLabels,
    breakBankTransactions,
    breakSessions,
    sleepLogs,
    appSettings,
  };
}

export async function checkInArrival(): Promise<Id> {
  const openArrival = await getOpenArrival();
  if (openArrival) {
    return openArrival.id;
  }

  const timestamp = nowIso();
  const id = createId("arrival");

  await db.arrival_sessions.add({
    id,
    local_date: toLocalDate(new Date(timestamp)),
    arrived_at: timestamp,
    created_at: timestamp,
    updated_at: timestamp,
  });

  return id;
}

export async function checkOutArrival(arrivalSessionId: Id): Promise<void> {
  const timestamp = nowIso();
  await db.arrival_sessions.update(arrivalSessionId, {
    left_at: timestamp,
    updated_at: timestamp,
  });
}

export async function startFocusTimer(
  plannedDurationMinutes: number,
): Promise<Id> {
  if (!Number.isFinite(plannedDurationMinutes) || plannedDurationMinutes <= 0) {
    throw new Error("倒计时时长必须大于 0。");
  }

  const activeSession = await getActiveFocusSession();
  if (activeSession) {
    throw new Error("已有一轮倒计时正在进行。");
  }

  const activeBreakSession = await getActiveBreakSession();
  if (activeBreakSession) {
    throw new Error("休息倒计时正在进行。");
  }

  const timestamp = nowIso();
  const openArrival = await getOpenArrival();
  const id = createId("focus");
  const session: FocusSessionRecord = {
    id,
    arrival_session_id: openArrival?.id,
    local_date: toLocalDate(new Date(timestamp)),
    planned_duration_minutes: Math.round(plannedDurationMinutes),
    started_at: timestamp,
    paused_total_seconds: 0,
    state: "running",
    earned_break_minutes: 0,
    created_at: timestamp,
    updated_at: timestamp,
  };

  await db.focus_sessions.add(session);
  return id;
}

export async function pauseFocusTimer(focusSessionId: Id): Promise<void> {
  const session = await db.focus_sessions.get(focusSessionId);
  if (!session || session.state !== "running") {
    return;
  }

  const timestamp = nowIso();
  await db.focus_sessions.update(focusSessionId, {
    state: "paused",
    current_pause_started_at: timestamp,
    updated_at: timestamp,
  });
}

export async function resumeFocusTimer(focusSessionId: Id): Promise<void> {
  const session = await db.focus_sessions.get(focusSessionId);
  if (!session || session.state !== "paused") {
    return;
  }

  const timestamp = nowIso();
  const addedPauseSeconds = session.current_pause_started_at
    ? secondsBetween(session.current_pause_started_at, timestamp)
    : 0;

  await db.focus_sessions.update(focusSessionId, {
    state: "running",
    paused_total_seconds: session.paused_total_seconds + addedPauseSeconds,
    current_pause_started_at: undefined,
    updated_at: timestamp,
  });
}

export async function cancelFocusTimer(focusSessionId: Id): Promise<void> {
  const session = await db.focus_sessions.get(focusSessionId);
  if (!session || session.state === "reviewed") {
    return;
  }

  const timestamp = nowIso();
  await db.focus_sessions.update(focusSessionId, {
    state: "canceled",
    canceled_at: timestamp,
    current_pause_started_at: undefined,
    updated_at: timestamp,
  });
}

export async function completeFocusTimer(focusSessionId: Id): Promise<void> {
  const session = await db.focus_sessions.get(focusSessionId);
  if (
    !session ||
    session.state === "completed" ||
    session.state === "reviewed" ||
    session.state === "canceled"
  ) {
    return;
  }

  const timestamp = nowIso();
  const actualDurationMinutes = session.planned_duration_minutes;
  const earnedBreakMinutes = calculateEarnedBreakMinutes(actualDurationMinutes);

  await db.transaction("rw", db.focus_sessions, db.break_bank_transactions, async () => {
    await db.focus_sessions.update(focusSessionId, {
      state: "completed",
      actual_duration_minutes: actualDurationMinutes,
      completed_at: timestamp,
      current_pause_started_at: undefined,
      earned_break_minutes: earnedBreakMinutes,
      updated_at: timestamp,
    });

    if (earnedBreakMinutes > 0) {
      await db.break_bank_transactions.put({
        id: `break-earned-${focusSessionId}`,
        focus_session_id: focusSessionId,
        local_date: session.local_date,
        type: "earned",
        minutes: earnedBreakMinutes,
        note: "完成专注自动获得休息余额",
        created_at: timestamp,
      });
    }
  });
}

export async function submitSessionReview(
  input: SubmitSessionReviewInput,
): Promise<void> {
  if (input.attentionSwitchCount < 0) {
    throw new Error("注意力切换次数不能为负数。");
  }

  const focusSession = await db.focus_sessions.get(input.focusSessionId);
  if (!focusSession || focusSession.state !== "completed") {
    throw new Error("只能复盘已经完成且尚未复盘的倒计时。");
  }

  const timestamp = nowIso();
  const reviewId = createId("review");
  const balance = await getBreakBalance();
  const breakMinutesUsed =
    input.breakChoice === "use_now"
      ? Math.round(Math.max(0, input.breakMinutesUsed ?? 0))
      : 0;

  if (input.breakChoice === "use_now" && breakMinutesUsed <= 0) {
    throw new Error("使用休息时，休息分钟数必须大于 0。");
  }

  if (breakMinutesUsed > balance) {
    throw new Error("使用的休息时间不能超过当前余额。");
  }

  await db.transaction(
    "rw",
    [
      db.session_reviews,
      db.session_review_labels,
      db.focus_sessions,
      db.break_bank_transactions,
      db.break_sessions,
      db.arrival_sessions,
    ],
    async () => {
      await db.session_reviews.add({
        id: reviewId,
        focus_session_id: input.focusSessionId,
        status_label_id: input.statusLabelId,
        attention_switch_count: Math.round(input.attentionSwitchCount),
        product_note: input.productNote?.trim() || undefined,
        blocker_note: input.blockerNote?.trim() || undefined,
        created_at: timestamp,
        updated_at: timestamp,
      });

      const labelRelations = [
        ...input.productLabelIds.map((labelId) => ({
          id: createId("review-label"),
          review_id: reviewId,
          label_id: labelId,
          label_type: "product" as const,
          created_at: timestamp,
        })),
        ...input.blockerLabelIds.map((labelId) => ({
          id: createId("review-label"),
          review_id: reviewId,
          label_id: labelId,
          label_type: "blocker" as const,
          created_at: timestamp,
        })),
      ];

      if (labelRelations.length > 0) {
        await db.session_review_labels.bulkAdd(labelRelations);
      }

      if (breakMinutesUsed > 0) {
        const breakSessionId = createId("break");
        await db.break_bank_transactions.add({
          id: `break-used-${breakSessionId}`,
          focus_session_id: input.focusSessionId,
          local_date: focusSession.local_date,
          type: "used",
          minutes: -breakMinutesUsed,
          note: "复盘时选择使用休息余额",
          created_at: timestamp,
        });
        await db.break_sessions.add({
          id: breakSessionId,
          focus_session_id: input.focusSessionId,
          local_date: focusSession.local_date,
          planned_duration_minutes: breakMinutesUsed,
          started_at: timestamp,
          state: "running",
          created_at: timestamp,
          updated_at: timestamp,
        });
        await closeCurrentArrival(timestamp);
      } else {
        await restartArrivalForNextFocus(timestamp, "保留休息，等待下一轮专注");
      }

      await db.focus_sessions.update(input.focusSessionId, {
        state: "reviewed",
        updated_at: timestamp,
      });
    },
  );
}

export async function completeBreakTimer(
  breakSessionId: Id,
  options: { endedEarly?: boolean } = {},
): Promise<{ usedMinutes: number; refundMinutes: number }> {
  const session = await db.break_sessions.get(breakSessionId);
  if (!session || session.state !== "running") {
    return { usedMinutes: 0, refundMinutes: 0 };
  }

  const timestamp = nowIso();
  const usedMinutes = calculateUsedBreakMinutes(
    session.planned_duration_minutes,
    secondsBetween(session.started_at, timestamp),
    Boolean(options.endedEarly),
  );
  const refundMinutes = Math.max(0, session.planned_duration_minutes - usedMinutes);

  await db.transaction(
    "rw",
    db.break_sessions,
    db.break_bank_transactions,
    db.arrival_sessions,
    async () => {
      await db.break_sessions.update(breakSessionId, {
        state: "completed",
        actual_duration_minutes: usedMinutes,
        completed_at: timestamp,
        ended_early: Boolean(options.endedEarly),
        updated_at: timestamp,
      });

      if (refundMinutes > 0) {
        await db.break_bank_transactions.add({
          id: `break-refund-${breakSessionId}`,
          focus_session_id: session.focus_session_id,
          local_date: session.local_date,
          type: "adjustment",
          minutes: refundMinutes,
          note: "提前结束休息，退回未使用余额",
          created_at: timestamp,
        });
      }

      await restartArrivalForNextFocus(timestamp, "休息结束，等待下一轮专注");
    },
  );

  return { usedMinutes, refundMinutes };
}

export async function upsertSleepLog(input: {
  localDate: string;
  sleepDurationMinutes: number;
  energyScore: 1 | 2 | 3 | 4 | 5;
  note?: string;
}): Promise<void> {
  if (
    !Number.isFinite(input.sleepDurationMinutes) ||
    input.sleepDurationMinutes < 0
  ) {
    throw new Error("睡眠时长不能为负数。");
  }

  const timestamp = nowIso();
  const sleepDurationMinutes = Math.round(input.sleepDurationMinutes);
  const existing = await db.sleep_logs
    .where("local_date")
    .equals(input.localDate)
    .first();

  if (existing) {
    await db.sleep_logs.update(existing.id, {
      sleep_duration_minutes: sleepDurationMinutes,
      energy_score: input.energyScore,
      note: input.note?.trim() || undefined,
      updated_at: timestamp,
      deleted_at: undefined,
    });
    return;
  }

  const record: SleepLogRecord = {
    id: createId("sleep"),
    local_date: input.localDate,
    sleep_duration_minutes: sleepDurationMinutes,
    energy_score: input.energyScore,
    note: input.note?.trim() || undefined,
    created_at: timestamp,
    updated_at: timestamp,
  };

  await db.sleep_logs.add(record);
}

export async function createLabel(
  type: LabelType,
  name: string,
): Promise<void> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("标签名称不能为空。");
  }

  const timestamp = nowIso();
  const existingLabels = await db.labels.where("type").equals(type).toArray();
  const maxSortOrder = Math.max(0, ...existingLabels.map((label) => label.sort_order));
  const label: LabelRecord = {
    id: createId(`label-${type}`),
    type,
    name: trimmedName,
    color: "#4a5568",
    is_default: false,
    is_active: true,
    sort_order: maxSortOrder + 10,
    created_at: timestamp,
    updated_at: timestamp,
  };

  await db.labels.add(label);
}

export async function updateLabel(input: {
  labelId: Id;
  name?: string;
  isActive?: boolean;
}): Promise<void> {
  const updates: Partial<LabelRecord> = {
    updated_at: nowIso(),
  };

  if (typeof input.name === "string") {
    const trimmedName = input.name.trim();
    if (!trimmedName) {
      throw new Error("标签名称不能为空。");
    }
    updates.name = trimmedName;
  }

  if (typeof input.isActive === "boolean") {
    updates.is_active = input.isActive;
  }

  await db.labels.update(input.labelId, updates);
}

export async function getBreakBalance(): Promise<number> {
  const transactions = await db.break_bank_transactions.toArray();
  return calculateBreakBalance(transactions);
}

export async function exportAllData(): Promise<AppSnapshot> {
  return loadSnapshot();
}

export async function seedDemoData(): Promise<{
  days: number;
  focusCount: number;
  totalFocusMinutes: number;
}> {
  await initializeDatabase();

  const now = nowIso();
  let focusCount = 0;
  let totalFocusMinutes = 0;
  let reviewLabelCount = 0;

  await db.transaction(
    "rw",
    [
      db.arrival_sessions,
      db.focus_sessions,
      db.session_reviews,
      db.session_review_labels,
      db.break_bank_transactions,
      db.break_sessions,
      db.sleep_logs,
    ],
    async () => {
      await deleteDemoRecords();

      for (const day of demoDays) {
        const arrivalId = `demo-arrival-${day.date}`;
        let cursorMinutes = day.delay;

        await db.arrival_sessions.put({
          id: arrivalId,
          local_date: day.date,
          arrived_at: toDemoIso(day.date, day.arrival, 0),
          left_at: toDemoIso(day.date, day.arrival, day.delay + 420),
          note: "Demo 到岗记录",
          created_at: now,
          updated_at: now,
        });

        for (const [index, session] of day.sessions.entries()) {
          const focusId = `demo-focus-${day.date}-${index + 1}`;
          const reviewId = `demo-review-${day.date}-${index + 1}`;
          const startedAt = toDemoIso(day.date, day.arrival, cursorMinutes);
          const completedAt = toDemoIso(
            day.date,
            day.arrival,
            cursorMinutes + session.minutes,
          );
          const earnedBreak = calculateEarnedBreakMinutes(session.minutes);

          await db.focus_sessions.put({
            id: focusId,
            arrival_session_id: arrivalId,
            local_date: day.date,
            planned_duration_minutes: session.minutes,
            actual_duration_minutes: session.minutes,
            started_at: startedAt,
            paused_total_seconds: 0,
            completed_at: completedAt,
            state: "reviewed",
            earned_break_minutes: earnedBreak,
            created_at: now,
            updated_at: now,
          });

          await db.session_reviews.put({
            id: reviewId,
            focus_session_id: focusId,
            status_label_id: session.status,
            attention_switch_count: session.switches,
            product_note: session.note,
            blocker_note: session.blockerNote,
            created_at: completedAt,
            updated_at: now,
          });

          for (const labelId of session.products) {
            reviewLabelCount += 1;
            await db.session_review_labels.put({
              id: `demo-review-label-${reviewLabelCount}`,
              review_id: reviewId,
              label_id: labelId,
              label_type: "product",
              created_at: completedAt,
            });
          }

          for (const labelId of session.blockers) {
            reviewLabelCount += 1;
            await db.session_review_labels.put({
              id: `demo-review-label-${reviewLabelCount}`,
              review_id: reviewId,
              label_id: labelId,
              label_type: "blocker",
              created_at: completedAt,
            });
          }

          if (earnedBreak > 0) {
            await db.break_bank_transactions.put({
              id: `demo-break-earned-${day.date}-${index + 1}`,
              focus_session_id: focusId,
              local_date: day.date,
              type: "earned",
              minutes: earnedBreak,
              note: "Demo 完成专注自动获得休息余额",
              created_at: completedAt,
            });
          }

          focusCount += 1;
          totalFocusMinutes += session.minutes;
          cursorMinutes += session.minutes + 10;
        }

        if (day.breakUsed > 0) {
          await db.break_bank_transactions.put({
            id: `demo-break-used-${day.date}`,
            local_date: day.date,
            type: "used",
            minutes: -day.breakUsed,
            note: "Demo 使用休息余额",
            created_at: toDemoIso(day.date, day.arrival, cursorMinutes + 5),
          });
        }

        const existingSleep = await db.sleep_logs
          .where("local_date")
          .equals(day.date)
          .first();

        if (!existingSleep || existingSleep.id.startsWith("demo-")) {
          await db.sleep_logs.put({
            id: `demo-sleep-${day.date}`,
            local_date: day.date,
            sleep_duration_minutes: day.sleep,
            energy_score: day.energy,
            note: "Demo 睡眠记录",
            created_at: now,
            updated_at: now,
          });
        }
      }
    },
  );

  return {
    days: demoDays.length,
    focusCount,
    totalFocusMinutes,
  };
}

async function getOpenArrival() {
  const arrivals = await db.arrival_sessions.toArray();

  return arrivals
    .filter((arrival) => !arrival.deleted_at && !arrival.left_at)
    .sort(
      (a, b) =>
        new Date(b.arrived_at).getTime() - new Date(a.arrived_at).getTime(),
    )[0];
}

async function closeCurrentArrival(timestamp: string): Promise<void> {
  const openArrival = await getOpenArrival();
  if (!openArrival) {
    return;
  }

  await db.arrival_sessions.update(openArrival.id, {
    left_at: timestamp,
    updated_at: timestamp,
  });
}

async function restartArrivalForNextFocus(
  timestamp: string,
  note: string,
): Promise<void> {
  await closeCurrentArrival(timestamp);
  await db.arrival_sessions.add({
    id: createId("arrival"),
    local_date: toLocalDate(new Date(timestamp)),
    arrived_at: timestamp,
    note,
    created_at: timestamp,
    updated_at: timestamp,
  });
}

async function deleteDemoRecords(): Promise<void> {
  await Promise.all([
    deleteRecordsWithPrefix(db.arrival_sessions, "demo-"),
    deleteRecordsWithPrefix(db.focus_sessions, "demo-"),
    deleteRecordsWithPrefix(db.session_reviews, "demo-"),
    deleteRecordsWithPrefix(db.session_review_labels, "demo-"),
    deleteRecordsWithPrefix(db.break_bank_transactions, "demo-"),
    deleteRecordsWithPrefix(db.break_sessions, "demo-"),
    deleteRecordsWithPrefix(db.sleep_logs, "demo-"),
  ]);
}

async function deleteRecordsWithPrefix<T extends { id: string }>(
  table: { toArray: () => Promise<T[]>; bulkDelete: (keys: string[]) => Promise<unknown> },
  prefix: string,
): Promise<void> {
  const keys = (await table.toArray())
    .filter((record) => record.id.startsWith(prefix))
    .map((record) => record.id);

  if (keys.length > 0) {
    await table.bulkDelete(keys);
  }
}

function toDemoIso(date: string, time: string, addMinutes = 0): string {
  const [hour, minute] = time.split(":").map(Number);
  const value = new Date(`${date}T00:00:00+09:00`);
  value.setHours(hour, minute + addMinutes, 0, 0);
  return value.toISOString();
}

async function getActiveFocusSession() {
  const sessions = await db.focus_sessions
    .where("state")
    .anyOf(["running", "paused"])
    .toArray();

  return sessions.find((session) => !session.deleted_at);
}

async function getActiveBreakSession(): Promise<BreakSessionRecord | undefined> {
  const sessions = await db.break_sessions.where("state").equals("running").toArray();

  return sessions.sort(
    (a, b) =>
      new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
  )[0];
}
