export type Id = string;
export type ISODateTime = string;
export type LocalDate = string;
export type TimeZoneId = string;

export type LabelType = "session_status" | "product" | "blocker";
export type FocusSessionState =
  | "running"
  | "paused"
  | "completed"
  | "reviewed"
  | "canceled";
export type BreakTransactionType = "earned" | "used" | "adjustment";
export type BreakSessionState = "running" | "completed" | "canceled";
export type AnalyticsGrain = "day" | "week" | "month";
export type DayTimelineCellState =
  | "empty"
  | "startup_delay"
  | "break"
  | "focus"
  | "blocked";

export interface LabelRecord {
  id: Id;
  type: LabelType;
  name: string;
  color?: string;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at?: ISODateTime;
}

export interface ArrivalSessionRecord {
  id: Id;
  local_date: LocalDate;
  time_zone?: TimeZoneId;
  arrived_at: ISODateTime;
  left_at?: ISODateTime;
  note?: string;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at?: ISODateTime;
}

export interface FocusSessionRecord {
  id: Id;
  arrival_session_id?: Id;
  local_date: LocalDate;
  time_zone?: TimeZoneId;
  planned_duration_minutes: number;
  actual_duration_minutes?: number;
  started_at: ISODateTime;
  paused_total_seconds: number;
  current_pause_started_at?: ISODateTime;
  completed_at?: ISODateTime;
  canceled_at?: ISODateTime;
  state: FocusSessionState;
  earned_break_minutes: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at?: ISODateTime;
}

export interface FocusSegmentRecord {
  id: Id;
  focus_session_id: Id;
  local_date: LocalDate;
  time_zone?: TimeZoneId;
  started_at: ISODateTime;
  ended_at?: ISODateTime;
  state: "running" | "completed" | "canceled";
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at?: ISODateTime;
}

export interface SessionReviewRecord {
  id: Id;
  focus_session_id: Id;
  status_label_id: Id;
  attention_switch_count: number;
  product_note?: string;
  blocker_note?: string;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at?: ISODateTime;
}

export interface SessionReviewLabelRecord {
  id: Id;
  review_id: Id;
  label_id: Id;
  label_type: LabelType;
  created_at: ISODateTime;
}

export interface BreakBankTransactionRecord {
  id: Id;
  focus_session_id?: Id;
  local_date: LocalDate;
  time_zone?: TimeZoneId;
  type: BreakTransactionType;
  minutes: number;
  note?: string;
  created_at: ISODateTime;
}

export interface BreakSessionRecord {
  id: Id;
  focus_session_id?: Id;
  local_date: LocalDate;
  time_zone?: TimeZoneId;
  planned_duration_minutes: number;
  actual_duration_minutes?: number;
  started_at: ISODateTime;
  completed_at?: ISODateTime;
  canceled_at?: ISODateTime;
  ended_early?: boolean;
  state: BreakSessionState;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface SleepLogRecord {
  id: Id;
  local_date: LocalDate;
  time_zone?: TimeZoneId;
  sleep_duration_minutes: number;
  energy_score: 1 | 2 | 3 | 4 | 5;
  note?: string;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at?: ISODateTime;
}

export interface AppSettingRecord {
  key: string;
  value_json: string;
  updated_at: ISODateTime;
}

export interface AppSnapshot {
  labels: LabelRecord[];
  arrivalSessions: ArrivalSessionRecord[];
  focusSessions: FocusSessionRecord[];
  focusSegments: FocusSegmentRecord[];
  sessionReviews: SessionReviewRecord[];
  sessionReviewLabels: SessionReviewLabelRecord[];
  breakBankTransactions: BreakBankTransactionRecord[];
  breakSessions: BreakSessionRecord[];
  sleepLogs: SleepLogRecord[];
  appSettings: AppSettingRecord[];
}

export interface BackupTables {
  labels: LabelRecord[];
  arrival_sessions: ArrivalSessionRecord[];
  focus_sessions: FocusSessionRecord[];
  focus_segments: FocusSegmentRecord[];
  session_reviews: SessionReviewRecord[];
  session_review_labels: SessionReviewLabelRecord[];
  break_bank_transactions: BreakBankTransactionRecord[];
  break_sessions: BreakSessionRecord[];
  sleep_logs: SleepLogRecord[];
  app_settings: AppSettingRecord[];
}

export interface AppBackup {
  format: "status-record.backup";
  formatVersion: 1;
  appVersion: string;
  exportedAt: ISODateTime;
  tables: BackupTables;
}

export interface ImportDataResult {
  sourceFormat: "backup_v1" | "legacy_snapshot";
  importedRecordCount: number;
  tableCounts: Record<keyof BackupTables, number>;
}

export interface SubmitSessionReviewInput {
  focusSessionId: Id;
  statusLabelId: Id;
  attentionSwitchCount: number;
  productLabelIds: Id[];
  productNote?: string;
  blockerLabelIds: Id[];
  blockerNote?: string;
  breakChoice: "use_now" | "save_for_later";
  breakMinutesUsed?: number;
}

export interface AnalyticsRange {
  startDate: LocalDate;
  endDate: LocalDate;
  grain: AnalyticsGrain;
}

export interface ReviewDetailEntry {
  id: Id;
  focusSessionId: Id;
  local_date: LocalDate;
  completed_at?: ISODateTime;
  focusMinutes: number;
  statusLabelId: Id;
  statusLabelName: string;
  productLabelIds: Id[];
  productLabelNames: string[];
  blockerLabelIds: Id[];
  blockerLabelNames: string[];
  productNote?: string;
  blockerNote?: string;
  attentionSwitchCount: number;
}

export interface AnalyticsTrendPoint {
  date: LocalDate;
  focusMinutes: number;
  startupDelayMinutes: number;
  attentionSwitchCount: number;
  sleepDurationHours?: number;
  energyScore?: number;
}

export interface DayTimelineCell {
  id: string;
  hour: number;
  slot: number;
  minuteOfDay: number;
  timeLabel: string;
  state: DayTimelineCellState;
  title: string;
}

export interface AnalyticsSummary {
  range: AnalyticsRange;
  totalFocusMinutes: number;
  totalStartupDelayMinutes: number;
  averageStartupDelayMinutes: number | null;
  totalAttentionSwitchCount: number;
  attentionSwitchesPerFocusHour: number | null;
  statusCounts: Record<Id, number>;
  productLabelCounts: Record<Id, number>;
  blockerLabelCounts: Record<Id, number>;
  averageSleepDurationMinutes: number | null;
  averageEnergyScore: number | null;
  trend: AnalyticsTrendPoint[];
  reviewEntries: ReviewDetailEntry[];
  notStartedArrivalCount: number;
}
