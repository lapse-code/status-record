# API Contract

MVP 是本地优先网页应用，因此这里的 API 指内部 application service contract，不代表必须存在 HTTP 后端。后续如果增加同步服务，可把这些 contract 映射为 HTTP 或 RPC。

## 通用类型

```ts
type ISODateTime = string;
type LocalDate = string; // YYYY-MM-DD
type Id = string;

type LabelType = "session_status" | "product" | "blocker";
```

## Timer Service

### startFocusTimer

```ts
interface StartFocusTimerInput {
  arrivalSessionId?: Id;
  plannedDurationMinutes: number;
  startedAt?: ISODateTime;
}

interface StartFocusTimerResult {
  focusSessionId: Id;
  plannedDurationMinutes: number;
  startedAt: ISODateTime;
}
```

规则：

- `plannedDurationMinutes` 必须大于 0。
- 如果当天有打开的 arrival session，应自动绑定。
- 如果没有打开的 arrival session，系统必须同步创建一条 arrival session，并把本轮 focus session 绑定到它；此时启动延迟按 0 分钟计算。

### completeFocusTimer

```ts
interface CompleteFocusTimerInput {
  focusSessionId: Id;
  completedAt?: ISODateTime;
}

interface CompleteFocusTimerResult {
  focusSessionId: Id;
  earnedBreakMinutes: number;
  requiresReview: true;
}
```

规则：

- 完成后创建待复盘状态。
- `actualDurationMinutes` 由系统按实际有效专注时间计算：`completedAt - startedAt - pausedTotalSeconds - activePauseSeconds`，向下取整到分钟，并且不超过 `plannedDurationMinutes`。
- `earnedBreakMinutes = floor(actualDurationMinutes / 25) * 5`。
- 暂停时记录 `current_pause_started_at`，继续时累计到 `paused_total_seconds`，刷新页面后可恢复合理剩余时间。

## Review Service

### submitSessionReview

```ts
interface SubmitSessionReviewInput {
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

interface SubmitSessionReviewResult {
  reviewId: Id;
  focusSessionId: Id;
  breakBalanceMinutes: number;
}
```

规则：

- `attentionSwitchCount` 必须是 0 或正整数。
- `statusLabelId` 必填。
- `blockerLabelIds` 可以包含默认“无”标签；如果选择“无”，不应同时选择其他阻塞标签。
- `breakMinutesUsed` 不能超过当前休息余额。
- `breakChoice = "use_now"` 时，`breakMinutesUsed` 必须大于 0，并创建休息倒计时。
- `breakChoice = "save_for_later"` 时，不扣余额，提交后直接重开下一轮启动延迟记录。
- 提交后 focus session 状态变为 `reviewed`。

## Break Timer Service

### completeBreakTimer

```ts
interface BreakSession {
  id: Id;
  focusSessionId?: Id;
  localDate: LocalDate;
  plannedDurationMinutes: number;
  actualDurationMinutes?: number;
  startedAt: ISODateTime;
  completedAt?: ISODateTime;
  endedEarly?: boolean;
  state: "running" | "completed" | "canceled";
}

interface CompleteBreakTimerResult {
  usedMinutes: number;
  refundMinutes: number;
}
```

规则：

- 用户在复盘中选择“使用休息”后，系统创建 running break session。
- 休息倒计时自然结束时，使用完整计划休息分钟。
- 用户提前结束休息时，按已过时间向上取整扣除实际使用分钟，未用完分钟写入 adjustment 退回余额。
- 休息结束后，系统重新打开一个 arrival session，用于记录下一轮启动延迟。

## Arrival Service

### checkInArrival

```ts
interface CheckInArrivalInput {
  arrivedAt?: ISODateTime;
  note?: string;
}

interface CheckInArrivalResult {
  arrivalSessionId: Id;
  arrivedAt: ISODateTime;
}
```

### checkOutArrival

```ts
interface CheckOutArrivalInput {
  arrivalSessionId: Id;
  leftAt?: ISODateTime;
}
```

### getStartupDelay

```ts
interface StartupDelayResult {
  arrivalSessionId: Id;
  firstFocusSessionId?: Id;
  startupDelayMinutes?: number;
  status: "not_started" | "started" | "closed_without_focus";
}
```

规则：

- 有第一轮 focus session 时，`startupDelayMinutes = firstFocus.startedAt - arrivedAt`。
- 没有开始番茄钟时不伪造 0。

## Sleep Service

### upsertSleepLog

```ts
interface UpsertSleepLogInput {
  date: LocalDate;
  sleepDurationMinutes: number;
  energyScore: 1 | 2 | 3 | 4 | 5;
  note?: string;
}
```

规则：

- 每个日期最多一条 sleep log。
- 重复提交同一天数据时更新旧记录。
- UI 使用可键盘输入的步进控件，显示 `6:00`、`6:15`、`6:30` 这种 15 分钟粒度文本，默认 `7:00`；上箭头减少 15 分钟、下箭头增加 15 分钟。service contract 只接收总分钟数，避免出现 `6.75 小时` 这种不自然显示。

## Label Service

### createLabel

```ts
interface CreateLabelInput {
  type: LabelType;
  name: string;
  color?: string;
}
```

### updateLabel

```ts
interface UpdateLabelInput {
  labelId: Id;
  name?: string;
  color?: string;
  isActive?: boolean;
  sortOrder?: number;
}
```

规则：

- 默认标签可以改名和隐藏，但不建议硬删除。
- 自定义标签可以删除；删除前要处理历史记录引用，建议软删除。

## Analytics Service

### getSummary

```ts
interface AnalyticsRangeInput {
  startDate: LocalDate;
  endDate: LocalDate;
  grain: "day" | "week" | "month";
}

interface AnalyticsSummary {
  range: AnalyticsRangeInput;
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
  trend: Array<{
    date: LocalDate;
    focusMinutes: number;
    startupDelayMinutes: number;
    attentionSwitchCount: number;
    sleepDurationHours?: number;
    energyScore?: number;
  }>;
  reviewEntries: Array<{
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
  }>;
  notStartedArrivalCount: number;
}
```

规则：

- 统计必须基于已完成并已复盘的 focus sessions。
- 睡眠统计按日期 join，不要求每个学习日都有睡眠记录。
- 复盘明细必须保留状态、产物、阻塞的标签 id 和名称，用于统计页按状态、产物或阻塞筛选“记录明细”。

### buildDayTimeline

```ts
type DayTimelineCellState = "empty" | "startup_delay" | "focus" | "blocked";

interface DayTimelineCell {
  id: string;
  hour: number; // 0-23
  slot: number; // 0-11, one slot is 5 minutes
  minuteOfDay: number;
  timeLabel: string; // HH:mm
  state: DayTimelineCellState;
  title: string;
}
```

规则：

- 一天固定输出 288 个 cell。
- 每 5 分钟一个点，源数据固定按一天 288 个 cell 输出。
- UI 可根据容器宽度重新分列：宽容器每列 30 分钟，窄容器每列 1 小时；这不改变 cell 的时间顺序和统计口径。
- `startup_delay` 来自 arrival 到第一轮 focus start 的时间段。
- `focus` 来自已复盘且没有阻塞/被打断的 focus session。
- `blocked` 来自有非“无”阻塞标签，或状态为“被打断/卡住”的 focus session。
- UI 可以为任意 `LocalDate` 调用此函数；日期导航不限制历史范围。

## Demo Data Service

### seedDemoData

```ts
interface SeedDemoDataResult {
  days: number;
  focusCount: number;
  totalFocusMinutes: number;
}
```

规则：

- 通过右上角“示例数据”按钮触发。
- 写入 2026-06-01 到 2026-06-10 的 demo 记录。
- 重复触发时只清理 `demo-` 前缀数据，不删除真实记录。
- Demo 数据写入当前浏览器 IndexedDB，因此无需后端。

## Backup Service

### exportAllData

```ts
interface AppBackup {
  format: "status-record.backup";
  formatVersion: 1;
  appVersion: string;
  exportedAt: ISODateTime;
  tables: {
    labels: LabelRecord[];
    arrival_sessions: ArrivalSessionRecord[];
    focus_sessions: FocusSessionRecord[];
    session_reviews: SessionReviewRecord[];
    session_review_labels: SessionReviewLabelRecord[];
    break_bank_transactions: BreakBankTransactionRecord[];
    break_sessions: BreakSessionRecord[];
    sleep_logs: SleepLogRecord[];
    app_settings: AppSettingRecord[];
  };
}
```

规则：

- 导出文件使用稳定备份格式，不再直接暴露 UI 内部的 camelCase `AppSnapshot`。
- `tables` 使用数据库表名，方便未来映射到后端同步或 SQLite。
- 导出只读本地 IndexedDB，不修改任何数据。

### importAllData

```ts
interface ImportDataResult {
  sourceFormat: "backup_v1" | "legacy_snapshot";
  importedRecordCount: number;
  tableCounts: Record<string, number>;
}
```

规则：

- 导入只接受 JSON 对象。
- 首选 `format = "status-record.backup"` 且 `formatVersion = 1` 的备份格式。
- 兼容早期直接导出的 `AppSnapshot` 结构，导入结果中 `sourceFormat = "legacy_snapshot"`。
- 导入前会检查每张表是数组，并检查主键字段：普通表需要 `id`，`app_settings` 需要 `key`。
- 导入采用合并写入：同 `id` 更新，不同 `id` 新增；不会先清空本地数据。
- 导入运行在 Dexie transaction 中；写入失败时应回滚本次导入。
- `sleep_logs.local_date` 是唯一字段；如果导入文件和本地已有同一天但不同 `id` 的睡眠记录，导入时保留本地 id 并写入导入内容，避免唯一索引冲突。
