import type { BreakBankTransactionRecord } from "../types";

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

export function calculateBreakBalance(
  transactions: BreakBankTransactionRecord[],
): number {
  return transactions.reduce((sum, transaction) => sum + transaction.minutes, 0);
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
