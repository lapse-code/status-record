# API Contract

MVP 是本地优先网页应用，因此这里的 API 指内部 application service contract，不代表必须存在 HTTP 后端。后续如果增加同步服务，可把这些 contract 映射为 HTTP 或 RPC。

## 通用类型

```ts
type ISODateTime = string;
type LocalDate = string; // YYYY-MM-DD
type TimeZoneId = string; // IANA time zone, e.g. Asia/Tokyo
type Id = string;

// `blocker` 是内部兼容名称，用户界面显示为“不专注原因”。
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
- 如果有打开的 arrival session，应自动绑定最早打开的那条，不能创建新 arrival session，也不能重置 `arrived_at`。
- 如果没有打开的 arrival session，系统必须同步创建一条 arrival session，并把本轮 focus session 绑定到它；此时拖延按 0 分钟计算。
- UI 中称为“拖延”，内部 contract 保留 startup delay 命名。

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
- `earnedBreakMinutes` 不是单轮独立计算，而是本轮 `actualDurationMinutes` 写入今日学习累计账本后，新跨过的 25 分钟门槛数量乘以 5。例如今天已有 15 分钟，本轮完成 15 分钟，则本轮获得 5 分钟休息，并留下 5 / 25 分钟今日进度。
- 暂停时关闭当前 `focus_segments` 专注片段并记录 `current_pause_started_at`，暂停后的时间回到打开的 arrival session 中，点阵显示为拖延。
- 继续时累计暂停秒数到 `paused_total_seconds`，并在同一个 focus session 下创建新的 `focus_segments` 片段。
- 点击完成会关闭当前片段，按当前有效专注分钟结束本轮，并进入复盘；点击取消会取消本轮，不进入专注统计，也不写入今日学习累计账本。

### FocusSegment

```ts
interface FocusSegment {
  id: Id;
  focusSessionId: Id;
  localDate: LocalDate;
  timeZone: TimeZoneId;
  startedAt: ISODateTime;
  endedAt?: ISODateTime;
  state: "running" | "completed" | "canceled";
}
```

规则：

- 统计和日点阵优先使用 completed focus segments 表示真实专注时间。
- 如果历史数据没有 focus segments，日点阵回退到 `focus_sessions.started_at + actual_duration_minutes` 的连续区间。

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
```

规则：

- `attentionSwitchCount` 必须是 0 或正整数。
- `statusLabelId` 必填。
- `blockerLabelIds` 可以包含默认“无”标签；如果选择“无”，不应同时选择其他不专注原因标签。
- `breakMinutesUsed` 不能超过当前日期的休息余额。
- `breakChoice = "use_now"` 时，`breakMinutesUsed` 必须大于 0，并创建休息倒计时。
- `breakChoice = "save_for_later"` 时，不扣余额，不关闭或重开 arrival session；如果用户仍到岗，后续等待自然继续算拖延。
- 提交后 focus session 状态变为 `reviewed`。
- 当前实现保存成功后返回 `Promise<void>`，调用方通过重新读取 snapshot 刷新 UI。

### updateSessionReview

```ts
interface UpdateSessionReviewInput {
  reviewId: Id;
  statusLabelId: Id;
  attentionSwitchCount: number;
  productLabelIds: Id[];
  productNote?: string;
  blockerLabelIds: Id[];
  blockerNote?: string;
}
```

规则：

- 只允许更新已有复盘记录的复盘参数。
- 可更新状态、注意力切换次数、产物标签、产物文字、不专注原因标签和不专注原因文字。
- 不修改 `focus_sessions` 的开始/结束时间、真实专注时长、状态、休息奖励或到岗记录。
- 不修改 `break_bank_transactions` 或 `break_sessions`，因此不会新增、扣除或回滚休息余额。
- 更新时会替换该 review 下的产物和不专注原因标签关联。
- `attentionSwitchCount` 必须是 0 或正整数。
- 保存成功后调用方应重新读取 snapshot，刷新统计、点阵和记录明细。

### createManualFocusRecord

```ts
interface CreateManualFocusRecordInput {
  localDate: LocalDate;
  startTime: string; // HH:mm
  durationMinutes: number;
  statusLabelId: Id;
  attentionSwitchCount: number;
  productLabelIds: Id[];
  productNote?: string;
  blockerLabelIds: Id[];
  blockerNote?: string;
}
```

规则：

- 用于 Today 页面“手动记录”，补录忘记开启番茄钟但已经完成的学习时间。
- `startTime` 是 `localDate` 当天、当前设备时区下的本地时间。
- `durationMinutes` 必须大于 0，当前上限为 24 小时。
- 保存后创建一条 `reviewed` focus session、一条 completed focus segment、一条 session review，以及对应的产物/不专注原因标签关系。
- 不创建、关闭、重开或修改 arrival session；如果时间段落在打开的到岗区间内，点阵和统计会用专注/不专注覆盖原本的拖延时间。
- 不显示或创建休息倒计时，也不写入 `break_bank_transactions`；但 `actual_duration_minutes` 会进入当天学习累计账本，动态增加今日休息余额。
- 手动记录时间段不能和已有非取消专注记录重叠，避免点阵时长和休息余额重复计算。
- 保存成功后调用方应重新读取 snapshot，刷新 Today 摘要、日点阵、统计和休息余额。

## Break Timer Service

### completeBreakTimer

```ts
interface BreakSession {
  id: Id;
  focusSessionId?: Id;
  localDate: LocalDate;
  timeZone: TimeZoneId;
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
- 休息自然结束且仍有可用余额时，UI 弹窗询问是否继续休息。
- 休息开始、休息结束、继续休息都不能关闭、重开或重置 arrival session；break session 只是覆盖到岗时间线中的休息区间。
- 用户选择开始专注时，如果没有开放到岗，UI 可以调用 `checkInArrival` 自动创建；如果已有开放到岗，必须复用原 arrival。
- 休息余额只看当前日期；昨天未使用的休息不会进入今天。

### startBreakTimer

```ts
interface StartBreakTimerInput {
  minutes: number;
}
```

规则：

- 用于复盘之外的继续休息场景，例如休息自然结束后继续使用余额。
- `minutes` 必须大于 0，且不能超过当前日期的休息余额。
- 启动时写入一条 `used` 交易，并创建新的 running `break_sessions`。
- 如果当前有打开的 arrival session，开始休息不能关闭它；日点阵和拖延统计通过 `break_sessions` 覆盖休息区间，避免休息时间被记为拖延。

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

规则：

- 到岗是开放状态单例：存在未关闭的 arrival session 时，重复到岗必须返回已有记录，不新增、不重置 `arrived_at`。
- 如果历史数据里已经有多条未关闭 arrival session，系统以最早打开的那条作为当前有效到岗。

### checkOutArrival

```ts
interface CheckOutArrivalInput {
  arrivalSessionId: Id;
  leftAt?: ISODateTime;
}
```

规则：

- 离开会关闭当前开放到岗状态。
- 如果历史数据里存在多条未关闭 arrival session，离开时会把这些重复开放记录一并关闭，避免刷新后再次显示错误到岗时间。

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

- 这是兼容和诊断用的底层启动延迟工具，不是 Today/Analytics 中“拖延”统计的来源。
- 有第一轮 focus session 时，`startupDelayMinutes = firstFocus.startedAt - arrivedAt`。
- 没有开始番茄钟时不伪造 0。
- UI 中的“拖延”统计必须使用 `buildDayTimeline` 的 `startup_delay` 真实时长汇总，包含第一轮前、暂停中、完成/休息后等待下一轮的全部在岗等待时间。

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
- UI 使用可键盘输入的步进控件，显示 `6:00`、`6:15`、`6:30` 这种 15 分钟粒度文本，默认 `7:00`；上箭头增加 15 分钟、下箭头减少 15 分钟。service contract 只接收总分钟数，避免出现 `6.75 小时` 这种不自然显示。
- 主观精力使用同一方向的步进输入：上箭头增加，最大 5；下箭头减少，最小 1。键盘 `ArrowUp` / `ArrowDown` 与按钮方向保持一致。

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

- `isActive = false` 表示归档；归档标签不再出现在新的复盘选择中，但历史统计继续按原标签计算。
- 默认标签和自定义标签都可以改名、改颜色、归档和解除归档，但 `status-completed` 是专注判定绑定状态，只能改名和改颜色，不能归档或删除。
- 删除标签使用软删除；删除前必须检查历史记录引用。
- 已被 `session_reviews.status_label_id` 或 `session_review_labels.label_id` 引用的标签不能删除，只能归档。

### deleteLabel

```ts
interface DeleteLabelInput {
  labelId: Id;
}
```

规则：

- 删除前检查该标签是否被任意有效复盘记录引用。
- 未被历史记录引用时，写入 `deleted_at` 并设置 `is_active = false`。
- 已有历史记录时返回错误，要求用户改用归档。
- `status-completed` 永远返回错误，不能删除。

## Settings Service

### updateAppSetting

```ts
interface UpdateAppSettingInput {
  key: string;
  value: unknown;
}
```

当前设置项：

- `timer`：默认番茄钟和休息规则兼容设置。
- `timelineColors`：点阵颜色设置，键为 `empty`、`startup_delay`、`break`、`focus`、`blocked`，值为 `#rrggbb`。

规则：

- 设置保存到 `app_settings.value_json`，导出和导入必须包含该表。
- 点阵颜色只影响日点阵、周点阵和图例，不改变标签本身的统计颜色。

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
  totalBlockedMinutes: number;
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
    blockedMinutes: number;
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

- `totalFocusMinutes`、`totalBlockedMinutes`、`totalStartupDelayMinutes` 以及 trend 中的 `focusMinutes`、`blockedMinutes`、`startupDelayMinutes` 必须使用和 `buildDayTimeline` 相同的时间覆盖规则计算真实状态时长，不按主色点数量统计。
- 日视图可以从日点阵 `durationMsByState` 校验这些时长；周/月视图应使用轻量区间汇总，不为了聚合统计生成范围内每天的完整 288 cell 点阵。
- UI 中 `startup_delay` 显示为“拖延”，`blocked` 显示为“不专注”。日视图中统计值必须等于点阵对应颜色的真实时长总和；周/月视图必须与同一套覆盖规则的区间汇总一致。
- 统计页“时间占比”使用方案 A：专注 + 不专注 + 拖延 = 100%，休息 `break` 不进入分母。
- 注意力切换、状态分布和标签分布基于已完成并已复盘的 focus sessions。
- 统计日期使用记录保存的 `local_date`；不要用当前设备时区重新计算历史记录日期。
- 睡眠统计按日期 join，不要求每个学习日都有睡眠记录。
- 复盘明细必须保留状态、产物、不专注原因的标签 id 和名称，用于统计页日视图按状态、产物或不专注原因筛选当天“记录明细”。
- `blockerLabelCounts` 作为底层聚合会保留默认“无”，用于历史数据完整性；统计页“不专注原因”图表在展示层排除“无”，没有其他原因时显示“暂无不专注原因记录”。

### buildDayTimeline

```ts
type DayTimelineCellState =
  | "empty"
  | "startup_delay"
  | "break"
  | "focus"
  | "blocked";

interface DayTimelineCell {
  id: string;
  hour: number; // 0-23
  slot: number; // 0-11, one slot is 5 minutes
  minuteOfDay: number;
  timeLabel: string; // HH:mm
  state: DayTimelineCellState;
  durationMsByState: Record<DayTimelineCellState, number>;
  parts: Array<{
    state: DayTimelineCellState;
    startRatio: number; // 0-1 inside this 5 minute cell
    endRatio: number; // 0-1 inside this 5 minute cell
  }>;
  title: string;
}
```

规则：

- 一天固定输出 288 个 cell。
- 每 5 分钟一个点，源数据固定按一天 288 个 cell 输出。
- 点阵按每条源记录自己的 `time_zone` 把 UTC 区间映射到目标 `LocalDate` 的本地分钟；同一目标日期中不同记录可以来自不同时区。
- 旧数据缺少 `time_zone` 时使用 `Asia/Tokyo` 兼容。
- UI 可根据容器宽度重新分列：宽容器每列 30 分钟，窄容器每列 1 小时；这不改变 cell 的时间顺序和统计口径。
- 每个 5 分钟 cell 内部按源记录和 cell 的真实重叠毫秒数累计到 `durationMsByState`，并输出 `parts` 给 UI 渲染混合分段；不要为了限制颜色点数丢弃跨 cell 的真实时间。
- `state` 只是 cell 的主状态，用于无障碍标签和兜底样式；图例、统计和“今日拖延”必须使用 `durationMsByState` 的真实时长汇总，不使用主状态点数。
- 每个 5 分钟 cell 的主状态用多数时长决定。
- 如果同一个 cell 内多个状态时长打平，用 `blocked > focus > startup_delay > break > empty` 的优先级决定颜色；空白只有在时长最多时才成为最终状态。
- `startup_delay` 在点阵中来自 arrival 区间内未被 focus 或 break 覆盖的等待时间，UI 显示为“拖延”。
- `break` 来自 `break_sessions` 的休息时间，UI 显示为“休息”；自然结束的休息按实际扣除/计划分钟封顶，避免浏览器回调延迟把 5 分钟休息画成超过 5 分钟。
- `focus` 来自未取消 focus session 的有效专注片段，UI 显示为“专注”；运行中的 `focus_segments` 用 `now` 作为临时结束时间，但不能超过本轮计划专注时长预算；完成但未复盘的 session 先按专注显示；已复盘 session 只有 `status_label_id = status-completed` 才保持专注。
- `blocked` 来自已复盘且 `status_label_id !== status-completed` 的 focus session，UI 显示为“不专注”。不专注原因标签只用于解释和统计，不参与点阵颜色判定。
- 取消的 focus session 和 canceled focus segment 不进入点阵；如果到岗仍打开，取消后的时间继续由 arrival 区间显示为拖延。
- UI 可以为任意 `LocalDate` 调用此函数；日期导航不限制历史范围。Today 页、统计页选中今天、周点阵包含今天时应传入当前 `now` 以实时刷新。

## UI Data Actions Contract

全局数据操作包括：

- 示例数据。
- 导入 JSON。
- 导出 JSON。

规则：

- 大屏布局可以把这些入口放在侧栏。
- 任何会隐藏侧栏操作区的响应式布局，都必须在主内容区域提供同等入口。
- 导入文件控件应与可见按钮解耦，避免某个布局下按钮存在但无法触发文件选择。

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

- 通过全局“示例数据”入口触发；大屏可在侧栏，侧栏操作区隐藏时在主内容区域显示。
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
    focus_segments: FocusSegmentRecord[];
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
- 备份包含各源记录的 `time_zone` 字段，确保换设备、旅行或未来迁移到账号同步后，历史时间线仍能按记录发生时区恢复。
- `focus_segments` 保存暂停/继续后的真实专注片段；旧备份缺少该表时导入按空数组兼容。
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
- 导入旧备份或旧 snapshot 时，如果到岗、专注、分段、休息、睡眠记录缺少 `time_zone`，按 `Asia/Tokyo` 回填。
- 导入前会检查每张表是数组，并检查主键字段：普通表需要 `id`，`app_settings` 需要 `key`。
- 导入采用合并写入：同 `id` 更新，不同 `id` 新增；不会先清空本地数据。
- 导入运行在 Dexie transaction 中；写入失败时应回滚本次导入。
- `sleep_logs.local_date` 是唯一字段；如果导入文件和本地已有同一天但不同 `id` 的睡眠记录，导入时保留本地 id 并写入导入内容，避免唯一索引冲突。
