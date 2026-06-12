import type {
  AppBackup,
  AppSnapshot,
  BackupTables,
  ImportDataResult,
} from "../types";
import { fallbackTimeZone } from "../domain/time";

const backupFormat = "status-record.backup";
const backupFormatVersion = 1;
const appVersion = "0.1.0";

type ParsedBackupPayload = {
  snapshot: AppSnapshot;
  sourceFormat: ImportDataResult["sourceFormat"];
};

export function createBackup(snapshot: AppSnapshot): AppBackup {
  return {
    format: backupFormat,
    formatVersion: backupFormatVersion,
    appVersion,
    exportedAt: new Date().toISOString(),
    tables: snapshotToTables(snapshot),
  };
}

export function parseBackupPayload(payload: unknown): ParsedBackupPayload {
  if (!isObject(payload)) {
    throw new Error("导入文件不是有效的 JSON 对象。");
  }

  if (payload.format === backupFormat) {
    if (payload.formatVersion !== backupFormatVersion) {
      throw new Error("导入文件版本暂不支持。");
    }

    if (!isObject(payload.tables)) {
      throw new Error("导入文件缺少 tables 数据。");
    }

    return {
      snapshot: addFallbackTimeZones(
        tablesToSnapshot(validateBackupTables(payload.tables)),
      ),
      sourceFormat: "backup_v1",
    };
  }

  return {
    snapshot: addFallbackTimeZones(validateLegacySnapshot(payload)),
    sourceFormat: "legacy_snapshot",
  };
}

export function countBackupTables(snapshot: AppSnapshot): ImportDataResult["tableCounts"] {
  return {
    labels: snapshot.labels.length,
    arrival_sessions: snapshot.arrivalSessions.length,
    focus_sessions: snapshot.focusSessions.length,
    focus_segments: snapshot.focusSegments.length,
    session_reviews: snapshot.sessionReviews.length,
    session_review_labels: snapshot.sessionReviewLabels.length,
    break_bank_transactions: snapshot.breakBankTransactions.length,
    break_sessions: snapshot.breakSessions.length,
    sleep_logs: snapshot.sleepLogs.length,
    app_settings: snapshot.appSettings.length,
  };
}

function snapshotToTables(snapshot: AppSnapshot): BackupTables {
  return {
    labels: snapshot.labels,
    arrival_sessions: snapshot.arrivalSessions,
    focus_sessions: snapshot.focusSessions,
    focus_segments: snapshot.focusSegments,
    session_reviews: snapshot.sessionReviews,
    session_review_labels: snapshot.sessionReviewLabels,
    break_bank_transactions: snapshot.breakBankTransactions,
    break_sessions: snapshot.breakSessions,
    sleep_logs: snapshot.sleepLogs,
    app_settings: snapshot.appSettings,
  };
}

function tablesToSnapshot(tables: BackupTables): AppSnapshot {
  return {
    labels: tables.labels,
    arrivalSessions: tables.arrival_sessions,
    focusSessions: tables.focus_sessions,
    focusSegments: tables.focus_segments,
    sessionReviews: tables.session_reviews,
    sessionReviewLabels: tables.session_review_labels,
    breakBankTransactions: tables.break_bank_transactions,
    breakSessions: tables.break_sessions,
    sleepLogs: tables.sleep_logs,
    appSettings: tables.app_settings,
  };
}

function validateBackupTables(value: object): BackupTables {
  return {
    labels: readRecords(value, "labels", "id"),
    arrival_sessions: readRecords(value, "arrival_sessions", "id"),
    focus_sessions: readRecords(value, "focus_sessions", "id"),
    focus_segments: readOptionalRecords(value, "focus_segments", "id"),
    session_reviews: readRecords(value, "session_reviews", "id"),
    session_review_labels: readRecords(value, "session_review_labels", "id"),
    break_bank_transactions: readRecords(value, "break_bank_transactions", "id"),
    break_sessions: readRecords(value, "break_sessions", "id"),
    sleep_logs: readRecords(value, "sleep_logs", "id"),
    app_settings: readRecords(value, "app_settings", "key"),
  };
}

function validateLegacySnapshot(value: object): AppSnapshot {
  return {
    labels: readRecords(value, "labels", "id"),
    arrivalSessions: readRecords(value, "arrivalSessions", "id"),
    focusSessions: readRecords(value, "focusSessions", "id"),
    focusSegments: readOptionalRecords(value, "focusSegments", "id"),
    sessionReviews: readRecords(value, "sessionReviews", "id"),
    sessionReviewLabels: readRecords(value, "sessionReviewLabels", "id"),
    breakBankTransactions: readRecords(value, "breakBankTransactions", "id"),
    breakSessions: readRecords(value, "breakSessions", "id"),
    sleepLogs: readRecords(value, "sleepLogs", "id"),
    appSettings: readRecords(value, "appSettings", "key"),
  };
}

function addFallbackTimeZones(snapshot: AppSnapshot): AppSnapshot {
  return {
    ...snapshot,
    arrivalSessions: snapshot.arrivalSessions.map(withFallbackTimeZone),
    focusSessions: snapshot.focusSessions.map(withFallbackTimeZone),
    focusSegments: snapshot.focusSegments.map(withFallbackTimeZone),
    breakBankTransactions:
      snapshot.breakBankTransactions.map(withFallbackTimeZone),
    breakSessions: snapshot.breakSessions.map(withFallbackTimeZone),
    sleepLogs: snapshot.sleepLogs.map(withFallbackTimeZone),
  };
}

function withFallbackTimeZone<T extends { time_zone?: string }>(record: T): T {
  return {
    ...record,
    time_zone: record.time_zone ?? fallbackTimeZone,
  };
}

function readRecords<T>(
  source: object,
  tableName: string,
  primaryKey: "id" | "key",
): T[] {
  const value = (source as Record<string, unknown>)[tableName];
  if (!Array.isArray(value)) {
    throw new Error(`导入文件缺少 ${tableName} 数组。`);
  }

  for (const [index, record] of value.entries()) {
    if (!isObject(record) || typeof record[primaryKey] !== "string") {
      throw new Error(`导入文件的 ${tableName}[${index}] 缺少 ${primaryKey}。`);
    }
  }

  return value as T[];
}

function readOptionalRecords<T>(
  source: object,
  tableName: string,
  primaryKey: "id" | "key",
): T[] {
  if (!(tableName in source)) {
    return [];
  }

  return readRecords(source, tableName, primaryKey);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
