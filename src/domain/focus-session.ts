import type { FocusSessionRecord, ISODateTime } from "../types";
import { secondsBetween } from "./time";

export function calculateCompletedFocusMinutes(
  session: FocusSessionRecord,
  completedAt: ISODateTime,
): number {
  const activeElapsedSeconds = calculateActiveElapsedSeconds(session, completedAt);
  const plannedSeconds = Math.max(0, Math.round(session.planned_duration_minutes)) * 60;
  const cappedSeconds = Math.min(activeElapsedSeconds, plannedSeconds);

  return Math.max(0, Math.floor(cappedSeconds / 60));
}

function calculateActiveElapsedSeconds(
  session: FocusSessionRecord,
  completedAt: ISODateTime,
): number {
  const activePauseSeconds =
    session.state === "paused" && session.current_pause_started_at
      ? secondsBetween(session.current_pause_started_at, completedAt)
      : 0;

  return (
    secondsBetween(session.started_at, completedAt) -
    session.paused_total_seconds -
    activePauseSeconds
  );
}
