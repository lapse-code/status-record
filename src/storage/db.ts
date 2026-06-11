import Dexie, { type Table } from "dexie";
import { createDefaultLabel, defaultLabelSeeds, defaultSettings } from "../defaults";
import type {
  AppSettingRecord,
  ArrivalSessionRecord,
  BreakSessionRecord,
  BreakBankTransactionRecord,
  FocusSessionRecord,
  LabelRecord,
  SessionReviewLabelRecord,
  SessionReviewRecord,
  SleepLogRecord,
} from "../types";

class StatusRecordDatabase extends Dexie {
  labels!: Table<LabelRecord, string>;
  arrival_sessions!: Table<ArrivalSessionRecord, string>;
  focus_sessions!: Table<FocusSessionRecord, string>;
  session_reviews!: Table<SessionReviewRecord, string>;
  session_review_labels!: Table<SessionReviewLabelRecord, string>;
  break_bank_transactions!: Table<BreakBankTransactionRecord, string>;
  break_sessions!: Table<BreakSessionRecord, string>;
  sleep_logs!: Table<SleepLogRecord, string>;
  app_settings!: Table<AppSettingRecord, string>;

  constructor() {
    super("status-record-db");
    this.version(1).stores({
      labels: "id,type,is_default,is_active,sort_order,deleted_at",
      arrival_sessions: "id,local_date,arrived_at,left_at,deleted_at",
      focus_sessions:
        "id,arrival_session_id,local_date,state,started_at,completed_at,canceled_at,deleted_at",
      session_reviews:
        "id,focus_session_id,status_label_id,created_at,deleted_at",
      session_review_labels: "id,review_id,label_id,label_type,created_at",
      break_bank_transactions:
        "id,focus_session_id,local_date,type,created_at",
      sleep_logs: "id,&local_date,deleted_at",
      app_settings: "key",
    });
    this.version(2).stores({
      labels: "id,type,is_default,is_active,sort_order,deleted_at",
      arrival_sessions: "id,local_date,arrived_at,left_at,deleted_at",
      focus_sessions:
        "id,arrival_session_id,local_date,state,started_at,completed_at,canceled_at,deleted_at",
      session_reviews:
        "id,focus_session_id,status_label_id,created_at,deleted_at",
      session_review_labels: "id,review_id,label_id,label_type,created_at",
      break_bank_transactions:
        "id,focus_session_id,local_date,type,created_at",
      break_sessions:
        "id,focus_session_id,local_date,state,started_at,completed_at,canceled_at",
      sleep_logs: "id,&local_date,deleted_at",
      app_settings: "key",
    });
  }
}

export const db = new StatusRecordDatabase();

export async function initializeDatabase(): Promise<void> {
  await db.transaction("rw", db.labels, db.app_settings, async () => {
    for (const seed of defaultLabelSeeds) {
      const existingLabel = await db.labels.get(seed.id);
      if (!existingLabel) {
        await db.labels.add(createDefaultLabel(seed));
      }
    }

    for (const setting of defaultSettings) {
      const existingSetting = await db.app_settings.get(setting.key);
      if (!existingSetting) {
        await db.app_settings.add(setting);
      }
    }
  });
}
