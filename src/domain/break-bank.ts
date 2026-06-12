import type { BreakBankTransactionRecord, FocusSessionRecord } from "../types";

export function calculateEarnedBreakMinutes(
  focusMinutes: number,
  focusBlockMinutes = 25,
  breakPerBlockMinutes = 5,
): number {
  if (focusMinutes <= 0 || focusBlockMinutes <= 0) {
    return 0;
  }

  return Math.floor(focusMinutes / focusBlockMinutes) * breakPerBlockMinutes;
}

export function calculateNewlyEarnedBreakMinutes(
  previousFocusMinutes: number,
  addedFocusMinutes: number,
  focusBlockMinutes = 25,
  breakPerBlockMinutes = 5,
): number {
  const previousEarned = calculateEarnedBreakMinutes(
    previousFocusMinutes,
    focusBlockMinutes,
    breakPerBlockMinutes,
  );
  const nextEarned = calculateEarnedBreakMinutes(
    previousFocusMinutes + Math.max(0, Math.round(addedFocusMinutes)),
    focusBlockMinutes,
    breakPerBlockMinutes,
  );

  return Math.max(0, nextEarned - previousEarned);
}

export interface DailyBreakLedger {
  balanceMinutes: number;
  earnedMinutes: number;
  focusCreditMinutes: number;
  progressMinutes: number;
  transactionMinutes: number;
}

export function calculateDailyBreakLedger(
  focusSessions: FocusSessionRecord[],
  transactions: BreakBankTransactionRecord[],
  localDate: string,
  focusBlockMinutes = 25,
  breakPerBlockMinutes = 5,
): DailyBreakLedger {
  const focusCreditMinutes = calculateDailyFocusCreditMinutes(
    focusSessions,
    localDate,
  );
  const earnedMinutes = calculateEarnedBreakMinutes(
    focusCreditMinutes,
    focusBlockMinutes,
    breakPerBlockMinutes,
  );
  const legacyEarnedMinutes =
    focusCreditMinutes === 0
      ? sumTransactions(transactions, localDate, "earned")
      : 0;
  const transactionMinutes = transactions
    .filter(
      (transaction) =>
        transaction.local_date === localDate && transaction.type !== "earned",
    )
    .reduce((sum, transaction) => sum + transaction.minutes, 0);

  return {
    balanceMinutes: earnedMinutes + legacyEarnedMinutes + transactionMinutes,
    earnedMinutes: earnedMinutes + legacyEarnedMinutes,
    focusCreditMinutes,
    progressMinutes:
      focusBlockMinutes > 0 ? focusCreditMinutes % focusBlockMinutes : 0,
    transactionMinutes,
  };
}

export function calculateDailyFocusCreditMinutes(
  focusSessions: FocusSessionRecord[],
  localDate: string,
): number {
  return focusSessions
    .filter(
      (session) =>
        !session.deleted_at &&
        session.local_date === localDate &&
        (session.state === "completed" || session.state === "reviewed"),
    )
    .reduce(
      (sum, session) =>
        sum + Math.max(0, Math.round(session.actual_duration_minutes ?? 0)),
      0,
    );
}

function sumTransactions(
  transactions: BreakBankTransactionRecord[],
  localDate: string,
  type: BreakBankTransactionRecord["type"],
): number {
  return transactions
    .filter(
      (transaction) =>
        transaction.local_date === localDate && transaction.type === type,
    )
    .reduce((sum, transaction) => sum + transaction.minutes, 0);
}

export function calculateUsedBreakMinutes(
  plannedMinutes: number,
  elapsedSeconds: number,
  endedEarly: boolean,
): number {
  const safePlannedMinutes = Math.max(0, Math.round(plannedMinutes));

  if (!endedEarly) {
    return safePlannedMinutes;
  }

  if (safePlannedMinutes === 0) {
    return 0;
  }

  return Math.min(
    safePlannedMinutes,
    Math.max(1, Math.ceil(Math.max(0, elapsedSeconds) / 60)),
  );
}
