import type { ArrivalSessionRecord, FocusSessionRecord, Id } from "../types";
import { minutesBetween } from "./time";

export interface StartupDelayResult {
  arrivalSessionId: Id;
  firstFocusSessionId?: Id;
  startupDelayMinutes?: number;
  status: "not_started" | "started" | "closed_without_focus";
}

export function computeStartupDelayForArrival(
  arrival: ArrivalSessionRecord,
  focusSessions: FocusSessionRecord[],
): StartupDelayResult {
  const firstFocus = focusSessions
    .filter(
      (session) =>
        session.arrival_session_id === arrival.id &&
        session.state !== "canceled" &&
        !session.deleted_at,
    )
    .sort(
      (a, b) =>
        new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
    )[0];

  if (!firstFocus) {
    return {
      arrivalSessionId: arrival.id,
      status: arrival.left_at ? "closed_without_focus" : "not_started",
    };
  }

  return {
    arrivalSessionId: arrival.id,
    firstFocusSessionId: firstFocus.id,
    startupDelayMinutes: minutesBetween(arrival.arrived_at, firstFocus.started_at),
    status: "started",
  };
}
