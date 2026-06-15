import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  LogIn,
  LogOut,
  Moon,
  Pause,
  Palette,
  Play,
  Plus,
  Save,
  Settings as SettingsIcon,
  Square,
  TimerReset,
  Trash2,
  Upload,
  X,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildAnalyticsSummary,
  buildDayTimeline,
  getAnalyticsRange,
  sumTimelineCellDurations,
} from "./domain/analytics";
import { calculateDailyBreakLedger } from "./domain/break-bank";
import {
  activeLabelsByType,
  getNoneBlockerLabel,
} from "./domain/labels";
import { focusStatusLabelId } from "./defaults";
import {
  fallbackTimeZone,
  formatMinutes,
  formatTimer,
  secondsBetween,
  toLocalDate,
} from "./domain/time";
import {
  cancelFocusTimer,
  checkInArrival,
  checkOutArrival,
  completeBreakTimer,
  completeFocusTimer,
  createLabel,
  deleteLabel,
  exportAllData,
  importAllData,
  loadSnapshot,
  pauseFocusTimer,
  resumeFocusTimer,
  seedDemoData,
  startBreakTimer,
  startFocusTimer,
  submitSessionReview,
  updateSessionReview,
  updateLabel,
  updateAppSetting,
  upsertSleepLog,
} from "./services/app-service";
import { primeReminderChannel, sendReminder } from "./reminders";
import type {
  AnalyticsGrain,
  AnalyticsSummary,
  AppSettingRecord,
  AppSnapshot,
  BreakSessionRecord,
  DayTimelineCell,
  FocusSessionRecord,
  Id,
  LabelRecord,
  LabelType,
  SubmitSessionReviewInput,
  UpdateSessionReviewInput,
} from "./types";

type TabId = "today" | "week" | "analytics" | "labels";
type DetailFilter = { type: LabelType; id: Id } | null;

type DataActionsProps = {
  className: string;
  onExport: () => void;
  onImportClick: () => void;
  onSeedDemoData: () => void;
};

function DataActions({
  className,
  onExport,
  onImportClick,
  onSeedDemoData,
}: DataActionsProps) {
  return (
    <div className={className} aria-label="数据操作">
      <button className="ghost-button" type="button" onClick={onSeedDemoData}>
        <Plus size={18} />
        示例数据
      </button>
      <button className="ghost-button" type="button" onClick={onImportClick}>
        <Upload size={18} />
        导入
      </button>
      <button className="ghost-button" type="button" onClick={onExport}>
        <Download size={18} />
        导出
      </button>
    </div>
  );
}

const emptySnapshot: AppSnapshot = {
  labels: [],
  arrivalSessions: [],
  focusSessions: [],
  focusSegments: [],
  sessionReviews: [],
  sessionReviewLabels: [],
  breakBankTransactions: [],
  breakSessions: [],
  sleepLogs: [],
  appSettings: [],
};

const presetMinutes = [25, 45, 50, 90];
const defaultSleepDurationMinutes = 7 * 60;
const maxSleepDurationMinutes = 14 * 60;
const sleepStepMinutes = 15;
const timelineColorSettingKey = "timelineColors";
const defaultTimelineColors: Record<DayTimelineCell["state"], string> = {
  empty: "#f0efed",
  startup_delay: "#e05c54",
  break: "#63b3ed",
  focus: "#2f855a",
  blocked: "#d49a24",
};
const timelineColorItems: {
  key: DayTimelineCell["state"];
  label: string;
}[] = [
  { key: "startup_delay", label: "拖延" },
  { key: "focus", label: "专注" },
  { key: "blocked", label: "不专注" },
  { key: "break", label: "休息" },
  { key: "empty", label: "空白" },
];
const labelColorPresets = [
  "#2f855a",
  "#e05c54",
  "#d49a24",
  "#63b3ed",
  "#3182ce",
  "#805ad5",
  "#c05621",
  "#718096",
  "#319795",
  "#d53f8c",
];
const labelSections: {
  type: LabelType;
  title: string;
  description: string;
}[] = [
  {
    type: "session_status",
    title: "状态",
    description: "复盘一轮专注后的结果分类。",
  },
  {
    type: "product",
    title: "产物",
    description: "这轮实际产出的文件、代码、笔记或材料。",
  },
  {
    type: "blocker",
    title: "不专注原因",
    description: "记录导致分心、打断或卡住的原因。",
  },
];

export default function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot>(emptySnapshot);
  const [activeTab, setActiveTab] = useState<TabId>("today");
  const [customMinutes, setCustomMinutes] = useState(25);
  const [message, setMessage] = useState<string>("");
  const [now, setNow] = useState(() => new Date());
  const [isLoading, setIsLoading] = useState(true);
  const [showBreakCompletionPrompt, setShowBreakCompletionPrompt] = useState(false);
  const completingRef = useRef<string | null>(null);
  const completingBreakRef = useRef<string | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    const nextSnapshot = await loadSnapshot();
    setSnapshot(nextSnapshot);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const activeFocusSession = useMemo(
    () => getActiveFocusSession(snapshot.focusSessions),
    [snapshot.focusSessions],
  );
  const pendingReviewSession = useMemo(
    () => getPendingReviewSession(snapshot.focusSessions),
    [snapshot.focusSessions],
  );
  const activeBreakSession = useMemo(
    () => getActiveBreakSession(snapshot.breakSessions),
    [snapshot.breakSessions],
  );
  const openArrival = useMemo(
    () => getOpenArrival(snapshot.arrivalSessions),
    [snapshot.arrivalSessions],
  );
  const currentLocalDate = toLocalDate(now);
  const timelineColors = useMemo(
    () => getTimelineColors(snapshot.appSettings),
    [snapshot.appSettings],
  );
  const timelineColorStyle = useMemo(
    () => getTimelineColorStyle(timelineColors),
    [timelineColors],
  );
  const breakLedger = useMemo(
    () =>
      calculateDailyBreakLedger(
        snapshot.focusSessions,
        snapshot.breakBankTransactions,
        currentLocalDate,
      ),
    [currentLocalDate, snapshot.breakBankTransactions, snapshot.focusSessions],
  );
  const breakBalance = breakLedger.balanceMinutes;
  const todayViewNow = activeTab === "today" ? now : null;
  const todaySummary = useMemo(
    () =>
      todayViewNow
        ? buildAnalyticsSummary(
          snapshot,
          getAnalyticsRange("day", todayViewNow),
          todayViewNow,
        )
        : null,
    [snapshot, todayViewNow],
  );
  const [todayTimelineDate, setTodayTimelineDate] = useState(toLocalDate());
  const todayTimeline = useMemo(
    () => (todayViewNow ? buildDayTimeline(snapshot, todayTimelineDate, todayViewNow) : []),
    [snapshot, todayTimelineDate, todayViewNow],
  );
  const todayTimelineTimeZoneLabel = useMemo(
    () => getTimelineTimeZoneLabel(snapshot, todayTimelineDate),
    [snapshot, todayTimelineDate],
  );
  const remainingSeconds = activeFocusSession
    ? getRemainingSeconds(activeFocusSession, now)
    : 0;
  const breakRemainingSeconds = activeBreakSession
    ? getBreakRemainingSeconds(activeBreakSession, now)
    : 0;

  useEffect(() => {
    if (
      activeFocusSession?.state === "running" &&
      remainingSeconds <= 0 &&
      completingRef.current !== activeFocusSession.id
    ) {
      completingRef.current = activeFocusSession.id;
      completeFocusTimer(activeFocusSession.id)
        .then(refresh)
        .then(() => {
          sendReminder("focus-complete");
          setMessage("本轮倒计时结束，请完成复盘。");
        })
        .finally(() => {
          completingRef.current = null;
        });
    }
  }, [activeFocusSession, refresh, remainingSeconds]);

  useEffect(() => {
    if (
      activeBreakSession?.state === "running" &&
      breakRemainingSeconds <= 0 &&
      completingBreakRef.current !== activeBreakSession.id
    ) {
      completingBreakRef.current = activeBreakSession.id;
      const shouldAskToExtendBreak = breakBalance > 0;
      completeBreakTimer(activeBreakSession.id)
        .then(refresh)
        .then(() => {
          sendReminder("break-complete");
          if (shouldAskToExtendBreak) {
            setShowBreakCompletionPrompt(true);
            setMessage(`休息结束，还有 ${formatMinutes(breakBalance)} 可用休息。`);
            return;
          }

          setMessage("休息结束，请选择下一轮番茄钟时间继续。");
        })
        .finally(() => {
          completingBreakRef.current = null;
        });
    }
  }, [activeBreakSession, breakBalance, breakRemainingSeconds, refresh]);

  async function runAction(action: () => Promise<void>, successMessage?: string) {
    try {
      await action();
      await refresh();
      if (successMessage) {
        setMessage(successMessage);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败。");
    }
  }

  async function handleStart(minutes: number) {
    const hasOpenArrival = Boolean(openArrival);
    void primeReminderChannel();
    await runAction(async () => {
      await startFocusTimer(minutes);
    }, hasOpenArrival ? `已开始 ${minutes} 分钟专注。` : `已自动到岗并开始 ${minutes} 分钟专注。`);
  }

  async function handleExport() {
    const data = await exportAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `status-record-${toLocalDate()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage("已导出 JSON 数据。");
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith(".json")) {
      setMessage("只能导入 JSON 文件。");
      return;
    }

    try {
      const payload = JSON.parse(await file.text()) as unknown;
      const result = await importAllData(payload);
      await refresh();
      setMessage(
        `已导入 ${result.importedRecordCount} 条记录。${
          result.sourceFormat === "legacy_snapshot" ? "旧版导出格式已兼容。" : ""
        }`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导入失败。");
    }
  }

  async function handleSeedDemoData() {
    try {
      const result = await seedDemoData();
      await refresh();
      setMessage(
        `已加载 ${result.days} 天示例数据：${result.focusCount} 轮，${result.totalFocusMinutes} 分钟。`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载示例数据失败。");
    }
  }

  async function handleExtendBreak(minutes: number) {
    try {
      await startBreakTimer(minutes);
      await refresh();
      setShowBreakCompletionPrompt(false);
      setMessage(`已继续休息 ${minutes} 分钟。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "启动休息失败。");
    }
  }

  async function handleStartLearningAfterBreak() {
    try {
      await checkInArrival();
      await refresh();
      setShowBreakCompletionPrompt(false);
      setMessage("已到岗，请选择下一轮番茄钟继续。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "开始学习失败。");
    }
  }

  const navigation = [
    { id: "today" as const, label: "今天", icon: Clock },
    { id: "week" as const, label: "周点阵", icon: CalendarDays },
    { id: "analytics" as const, label: "统计", icon: BarChart3 },
    { id: "labels" as const, label: "设置", icon: SettingsIcon },
  ];
  const activeViewCopy =
    activeTab === "today"
      ? { eyebrow: "今日工作台", title: "继续保持专注" }
      : activeTab === "week"
        ? { eyebrow: "一周点阵", title: "查看一周时间分布" }
      : activeTab === "analytics"
        ? { eyebrow: "统计分析", title: "复盘时间和状态" }
        : { eyebrow: "系统设置", title: "整理记录分类" };

  if (isLoading) {
    return <div className="app-shell loading">正在载入本地记录...</div>;
  }

  return (
    <div className="app-shell focus-studio-shell" style={timelineColorStyle}>
      <input
        ref={importFileInputRef}
        accept="application/json,.json"
        aria-label="导入 JSON 文件"
        className="visually-hidden"
        type="file"
        onChange={handleImport}
      />

      <aside className="side-nav">
        <div className="brand-mark">
          <span className="brand-icon">
            <CheckCircle2 size={20} />
          </span>
          <strong>Status Record</strong>
        </div>

        <nav className="tabs" aria-label="主导航">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={activeTab === item.id ? "tab active" : "tab"}
                type="button"
                onClick={() => setActiveTab(item.id)}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="side-panel">
          <span>休息余额</span>
          <strong>{formatMinutes(breakBalance)}</strong>
          <i>今日进度 {breakLedger.progressMinutes} / 25 分钟</i>
        </div>

        <div className="side-spacer" />

        <div className="side-panel subtle">
          <span>本地数据已就绪</span>
          <i>数据保存在此设备</i>
        </div>

        <DataActions
          className="data-actions side-actions"
          onExport={handleExport}
          onImportClick={() => importFileInputRef.current?.click()}
          onSeedDemoData={handleSeedDemoData}
        />
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{activeViewCopy.eyebrow}</p>
            <h1>{activeViewCopy.title}</h1>
          </div>
          <div className="topbar-meta">
            <span>{toLocalDate(now)}</span>
            <span>
              {now.toLocaleDateString("zh-CN", {
                weekday: "long",
              })}
            </span>
          </div>
        </header>

        <DataActions
          className="data-actions workspace-data-actions"
          onExport={handleExport}
          onImportClick={() => importFileInputRef.current?.click()}
          onSeedDemoData={handleSeedDemoData}
        />

        {message ? (
          <div className="notice" role="status">
            {message}
            <button type="button" onClick={() => setMessage("")}>
              关闭
            </button>
          </div>
        ) : null}

        {activeTab === "today" ? (
          <main className="layout-grid">
            <section className="panel timer-panel">
              <div className="panel-heading">
                <div>
                  <h2>专注倒计时</h2>
                  <p>到岗记录拖延，番茄钟记录真实专注分钟。</p>
                </div>
                <div
                  className={
                    activeBreakSession || openArrival ? "status-pill active" : "status-pill"
                  }
                >
                  {activeBreakSession ? "休息中" : openArrival ? "已到岗" : "未到岗"}
                </div>
              </div>

              <div className="arrival-row">
                {activeBreakSession
                  ? (
                    <span>休息倒计时进行中；到岗记录保持打开，休息之外的等待会继续算拖延。</span>
                  ) : openArrival ? (
                    <>
                      <span>
                        到岗时间：
                        {new Date(openArrival.arrived_at).toLocaleTimeString("zh-CN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() =>
                          runAction(
                            () => checkOutArrival(openArrival.id),
                            "已结束本次到岗记录。",
                          )
                        }
                      >
                        <LogOut size={18} />
                        离开
                      </button>
                    </>
                  ) : (
                    <>
                      <span>可以先到岗记录拖延；也可以直接开始番茄钟并同步到岗。</span>
                      <button
                        className="primary-button"
                        type="button"
                        onClick={() =>
                          runAction(async () => {
                            await checkInArrival();
                          }, "已到岗，拖延开始记录。")
                        }
                      >
                        <LogIn size={18} />
                        到岗
                      </button>
                    </>
                  )}
              </div>

              <div className="timer-face">
                <div className="timer-value" aria-live="polite">
                  {activeBreakSession
                    ? formatTimer(breakRemainingSeconds)
                    : activeFocusSession
                      ? formatTimer(remainingSeconds)
                      : pendingReviewSession
                        ? "待复盘"
                        : formatTimer(customMinutes * 60)}
                </div>
                <div className="timer-caption">
                  {activeBreakSession
                    ? "休息中"
                    : activeFocusSession
                      ? activeFocusSession.state === "paused"
                        ? "暂停中，正在记录拖延"
                        : "专注中"
                      : pendingReviewSession
                        ? "完成复盘后进入统计"
                        : "选择固定时长或自定义时长"}
                </div>
              </div>

              {activeBreakSession ? (
                <div className="button-row">
                  <button
                    className="primary-button"
                    type="button"
                    onClick={async () => {
                      const result = await completeBreakTimer(activeBreakSession.id, {
                        endedEarly: true,
                      });
                      await refresh();
                      setMessage(
                        result.refundMinutes > 0
                          ? `已提前结束休息，退回 ${result.refundMinutes} 分钟休息余额。请选择下一轮番茄钟时间继续。`
                          : "已提前结束休息，请选择下一轮番茄钟时间继续。",
                      );
                    }}
                  >
                    <CheckCircle2 size={18} />
                    提前结束休息
                  </button>
                </div>
              ) : activeFocusSession ? (
                <div className="button-row">
                  {activeFocusSession.state === "running" ? (
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() =>
                        runAction(
                          () => pauseFocusTimer(activeFocusSession.id),
                          "已暂停，正在记录拖延。",
                        )
                      }
                    >
                      <Pause size={18} />
                      暂停
                    </button>
                  ) : (
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() =>
                        runAction(
                          () => resumeFocusTimer(activeFocusSession.id),
                          "已继续专注。",
                        )
                      }
                    >
                      <Play size={18} />
                      继续
                    </button>
                  )}
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() =>
                      runAction(
                        () => completeFocusTimer(activeFocusSession.id),
                        "已按当前专注时长结束本轮，请复盘。",
                      )
                    }
                  >
                    <CheckCircle2 size={18} />
                    完成
                  </button>
                  <button
                    className="danger-button"
                    type="button"
                    onClick={() =>
                      runAction(
                        () => cancelFocusTimer(activeFocusSession.id),
                        "已取消本轮倒计时。",
                      )
                    }
                  >
                    <Square size={18} />
                    取消
                  </button>
                </div>
              ) : (
                <div className="timer-controls">
                  <div className="preset-grid">
                    {presetMinutes.map((minutes) => (
                      <button
                        key={minutes}
                        className="secondary-button"
                        type="button"
                        disabled={Boolean(pendingReviewSession || activeBreakSession)}
                        onClick={() => handleStart(minutes)}
                      >
                        <TimerReset size={18} />
                        {minutes} 分钟
                      </button>
                    ))}
                  </div>

                  <form
                    className="custom-time-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleStart(customMinutes);
                    }}
                  >
                    <label>
                      自定义分钟
                      <input
                        min={1}
                        max={240}
                        type="number"
                        value={customMinutes}
                        disabled={Boolean(pendingReviewSession || activeBreakSession)}
                        onChange={(event) =>
                          setCustomMinutes(Number(event.currentTarget.value))
                        }
                      />
                    </label>
                    <button
                      className="primary-button"
                      type="button"
                      disabled={Boolean(pendingReviewSession || activeBreakSession)}
                      onClick={() => void handleStart(customMinutes)}
                    >
                      <Play size={18} />
                      开始
                    </button>
                  </form>
                </div>
              )}

              <div className="break-bank-row">
                <div>
                  <span>休息余额</span>
                  <strong>{formatMinutes(breakBalance)}</strong>
                  <div
                    className="break-progress"
                    aria-label={`今日休息进度 ${breakLedger.progressMinutes} / 25 分钟`}
                  >
                    <span
                      style={
                        {
                          "--progress": `${(breakLedger.progressMinutes / 25) * 100}%`,
                        } as React.CSSProperties
                      }
                    />
                  </div>
                </div>
                <p>
                  今日番茄钟累计每满 25 分钟获得 5 分钟休息，未用余额明天清零。
                </p>
              </div>
            </section>

            <aside className="today-side">
              <section className="summary-strip">
                <StatCard
                  label="今日专注"
                  value={formatMinutes(todaySummary?.totalFocusMinutes ?? 0)}
                />
                <StatCard
                  label="今日拖延"
                  value={formatMinutes(todaySummary?.totalStartupDelayMinutes ?? 0)}
                />
                <StatCard
                  label="注意力切换"
                  value={`${todaySummary?.totalAttentionSwitchCount ?? 0} 次`}
                />
                <StatCard label="休息余额" value={formatMinutes(breakBalance)} />
              </section>

              <SleepPanel snapshot={snapshot} onSaved={refresh} onMessage={setMessage} />
            </aside>

            <DayTimelinePanel
              cells={todayTimeline}
              date={todayTimelineDate}
              timeZoneLabel={todayTimelineTimeZoneLabel}
              onDateChange={(date) => setTodayTimelineDate(date || toLocalDate())}
              onNextDate={() =>
                setTodayTimelineDate((date) => shiftLocalDate(date, 1))
              }
              onPreviousDate={() =>
                setTodayTimelineDate((date) => shiftLocalDate(date, -1))
              }
              onToday={() => setTodayTimelineDate(toLocalDate())}
            />
          </main>
        ) : null}

        {activeTab === "analytics" ? (
          <AnalyticsView
            snapshot={snapshot}
            now={now}
            timelineColors={timelineColors}
            onChanged={refresh}
            onMessage={setMessage}
          />
        ) : null}

        {activeTab === "week" ? (
          <WeekTimelineView snapshot={snapshot} now={now} />
        ) : null}

        {activeTab === "labels" ? (
          <SettingsView
            snapshot={snapshot}
            timelineColors={timelineColors}
            onChanged={refresh}
            onMessage={setMessage}
          />
        ) : null}
      </div>

      {pendingReviewSession ? (
        <ReviewModal
          focusSession={pendingReviewSession}
          labels={snapshot.labels}
          breakBalance={breakBalance}
          onSubmit={async (input) => {
            void primeReminderChannel();
            await runAction(
              () => submitSessionReview(input),
              input.breakChoice === "use_now"
                ? "复盘已保存，休息倒计时已开始。"
                : "复盘已保存，请选择下一轮番茄钟继续。",
            );
          }}
        />
      ) : null}

      {showBreakCompletionPrompt && !activeBreakSession && breakBalance > 0 ? (
        <BreakCompletionModal
          breakBalance={breakBalance}
          onExtendBreak={handleExtendBreak}
          onStartLearning={handleStartLearningAfterBreak}
        />
      ) : null}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SleepPanel({
  snapshot,
  onSaved,
  onMessage,
}: {
  snapshot: AppSnapshot;
  onSaved: () => Promise<void>;
  onMessage: (message: string) => void;
}) {
  const [localDate, setLocalDate] = useState(toLocalDate());
  const existing = snapshot.sleepLogs.find(
    (sleep) => sleep.local_date === localDate && !sleep.deleted_at,
  );
  const [sleepDurationMinutes, setSleepDurationMinutes] = useState(
    normalizeSleepDuration(
      existing?.sleep_duration_minutes ?? defaultSleepDurationMinutes,
    ),
  );
  const [sleepDurationInput, setSleepDurationInput] = useState(() =>
    formatSleepDurationInput(sleepDurationMinutes),
  );
  const [energyScore, setEnergyScore] = useState<1 | 2 | 3 | 4 | 5>(
    existing?.energy_score ?? 3,
  );
  const [energyInput, setEnergyInput] = useState(String(existing?.energy_score ?? 3));
  const [note, setNote] = useState(existing?.note ?? "");

  useEffect(() => {
    const nextSleepDuration = normalizeSleepDuration(
      existing?.sleep_duration_minutes ?? defaultSleepDurationMinutes,
    );
    const nextEnergyScore = existing?.energy_score ?? 3;
    setSleepDurationMinutes(nextSleepDuration);
    setSleepDurationInput(formatSleepDurationInput(nextSleepDuration));
    setEnergyScore(nextEnergyScore);
    setEnergyInput(String(nextEnergyScore));
    setNote(existing?.note ?? "");
  }, [existing?.energy_score, existing?.note, existing?.sleep_duration_minutes]);

  function applySleepDuration(nextMinutes: number) {
    const normalizedMinutes = normalizeSleepDuration(nextMinutes);
    setSleepDurationMinutes(normalizedMinutes);
    setSleepDurationInput(formatSleepDurationInput(normalizedMinutes));
  }

  function commitSleepDurationInput() {
    const normalizedMinutes = parseSleepDurationInput(
      sleepDurationInput,
      sleepDurationMinutes,
    );
    applySleepDuration(normalizedMinutes);
    return normalizedMinutes;
  }

  function applyEnergyScore(nextScore: number) {
    const normalizedScore = normalizeEnergyScore(nextScore);
    setEnergyScore(normalizedScore);
    setEnergyInput(String(normalizedScore));
  }

  function commitEnergyInput() {
    const normalizedScore = parseEnergyInput(energyInput, energyScore);
    applyEnergyScore(normalizedScore);
    return normalizedScore;
  }

  return (
    <section className="panel sleep-panel">
      <div className="panel-heading">
        <div>
          <h2>睡眠</h2>
          <p>每天记录一次，可以随时修改。</p>
        </div>
        <Moon size={22} />
      </div>
      <form
        className="sleep-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const normalizedSleepDuration = commitSleepDurationInput();
          const normalizedEnergyScore = commitEnergyInput();
          try {
            await upsertSleepLog({
              localDate,
              sleepDurationMinutes: normalizedSleepDuration,
              energyScore: normalizedEnergyScore,
              note,
            });
            await onSaved();
            onMessage("睡眠记录已保存。");
          } catch (error) {
            onMessage(error instanceof Error ? error.message : "保存失败。");
          }
        }}
      >
        <label>
          日期
          <input
            type="date"
            value={localDate}
            onChange={(event) => setLocalDate(event.currentTarget.value)}
          />
        </label>
        <label>
          睡眠时长
          <div className="stepper-control">
            <input
              aria-label="睡眠时长"
              inputMode="numeric"
              value={sleepDurationInput}
              onBlur={commitSleepDurationInput}
              onChange={(event) => setSleepDurationInput(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  applySleepDuration(sleepDurationMinutes + sleepStepMinutes);
                }
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  applySleepDuration(sleepDurationMinutes - sleepStepMinutes);
                }
                if (event.key === "Enter") {
                  commitSleepDurationInput();
                }
              }}
            />
            <div className="stepper-buttons">
              <button
                aria-label="增加睡眠时长 15 分钟"
                type="button"
                onClick={() => applySleepDuration(sleepDurationMinutes + sleepStepMinutes)}
              >
                <ChevronUp size={16} />
              </button>
              <button
                aria-label="减少睡眠时长 15 分钟"
                type="button"
                onClick={() => applySleepDuration(sleepDurationMinutes - sleepStepMinutes)}
              >
                <ChevronDown size={16} />
              </button>
            </div>
          </div>
        </label>
        <label>
          精力
          <div className="stepper-control compact">
            <input
              aria-label="精力"
              inputMode="numeric"
              value={energyInput}
              onBlur={commitEnergyInput}
              onChange={(event) => setEnergyInput(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  applyEnergyScore(energyScore + 1);
                }
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  applyEnergyScore(energyScore - 1);
                }
                if (event.key === "Enter") {
                  commitEnergyInput();
                }
              }}
            />
            <span className="stepper-suffix">/ 5</span>
            <div className="stepper-buttons">
              <button
                aria-label="增加精力"
                type="button"
                onClick={() => applyEnergyScore(energyScore + 1)}
              >
                <ChevronUp size={16} />
              </button>
              <button
                aria-label="减少精力"
                type="button"
                onClick={() => applyEnergyScore(energyScore - 1)}
              >
                <ChevronDown size={16} />
              </button>
            </div>
          </div>
        </label>
        <label className="wide-field">
          备注
          <input
            value={note}
            placeholder="可选"
            onChange={(event) => setNote(event.currentTarget.value)}
          />
        </label>
        <button className="primary-button" type="submit">
          <Save size={18} />
          保存睡眠
        </button>
      </form>
    </section>
  );
}

function normalizeSleepDuration(totalMinutes: number): number {
  if (!Number.isFinite(totalMinutes)) {
    return defaultSleepDurationMinutes;
  }

  const roundedMinutes = Math.round(totalMinutes / sleepStepMinutes) * sleepStepMinutes;
  return Math.min(maxSleepDurationMinutes, Math.max(0, roundedMinutes));
}

function parseSleepDurationInput(value: string, fallbackMinutes: number): number {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return fallbackMinutes;
  }

  const colonMatch = trimmedValue.match(/^(\d{1,2})[:：](\d{1,2})$/);
  if (colonMatch) {
    const hours = Number(colonMatch[1]);
    const minutes = Number(colonMatch[2]);
    return normalizeSleepDuration(hours * 60 + minutes);
  }

  const numericValue = Number(trimmedValue);
  if (!Number.isFinite(numericValue)) {
    return fallbackMinutes;
  }

  return normalizeSleepDuration(
    numericValue <= 24 ? numericValue * 60 : numericValue,
  );
}

function formatSleepDurationInput(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

function normalizeEnergyScore(score: number): 1 | 2 | 3 | 4 | 5 {
  if (!Number.isFinite(score)) {
    return 3;
  }

  return Math.min(5, Math.max(1, Math.round(score))) as 1 | 2 | 3 | 4 | 5;
}

function parseEnergyInput(value: string, fallbackScore: 1 | 2 | 3 | 4 | 5) {
  const parsedScore = Number(value.trim());
  return Number.isFinite(parsedScore)
    ? normalizeEnergyScore(parsedScore)
    : fallbackScore;
}

type ReviewFormValues = {
  statusLabelId: Id;
  attentionSwitchCount: number;
  productLabelIds: Id[];
  productNote: string;
  blockerLabelIds: Id[];
  blockerNote: string;
};

function selectableLabelsByType(
  labels: LabelRecord[],
  type: LabelType,
  selectedIds: Id[],
): LabelRecord[] {
  const selectedIdSet = new Set(selectedIds);

  return labels
    .filter(
      (label) =>
        label.type === type &&
        !label.deleted_at &&
        (label.is_active || selectedIdSet.has(label.id)),
    )
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

function ReviewFormFields({
  labels,
  values,
  onStatusLabelChange,
  onAttentionSwitchCountChange,
  onProductLabelIdsChange,
  onProductNoteChange,
  onBlockerLabelIdsChange,
  onBlockerNoteChange,
}: {
  labels: LabelRecord[];
  values: ReviewFormValues;
  onStatusLabelChange: (labelId: Id) => void;
  onAttentionSwitchCountChange: (count: number) => void;
  onProductLabelIdsChange: (labelIds: Id[]) => void;
  onProductNoteChange: (note: string) => void;
  onBlockerLabelIdsChange: (labelIds: Id[]) => void;
  onBlockerNoteChange: (note: string) => void;
}) {
  const statusLabels = selectableLabelsByType(labels, "session_status", [
    values.statusLabelId,
  ]);
  const productLabels = selectableLabelsByType(
    labels,
    "product",
    values.productLabelIds,
  );
  const blockerLabels = selectableLabelsByType(
    labels,
    "blocker",
    values.blockerLabelIds,
  );
  const noneBlocker = getNoneBlockerLabel(labels);

  function toggleProduct(labelId: Id) {
    onProductLabelIdsChange(
      values.productLabelIds.includes(labelId)
        ? values.productLabelIds.filter((id) => id !== labelId)
        : [...values.productLabelIds, labelId],
    );
  }

  function toggleBlocker(label: LabelRecord) {
    if (noneBlocker && label.id === noneBlocker.id) {
      onBlockerLabelIdsChange(
        values.blockerLabelIds.includes(label.id) ? [] : [label.id],
      );
      return;
    }

    const withoutNone = noneBlocker
      ? values.blockerLabelIds.filter((id) => id !== noneBlocker.id)
      : values.blockerLabelIds;

    onBlockerLabelIdsChange(
      withoutNone.includes(label.id)
        ? withoutNone.filter((id) => id !== label.id)
        : [...withoutNone, label.id],
    );
  }

  return (
    <>
      <fieldset>
        <legend>状态</legend>
        <div className="chip-grid">
          {statusLabels.map((label) => (
            <button
              key={label.id}
              className={values.statusLabelId === label.id ? "chip selected" : "chip"}
              style={{ "--chip-color": label.color } as React.CSSProperties}
              type="button"
              onClick={() => onStatusLabelChange(label.id)}
            >
              {label.name}
            </button>
          ))}
        </div>
      </fieldset>

      <label>
        注意力切换次数
        <input
          min={0}
          type="number"
          value={values.attentionSwitchCount}
          onChange={(event) =>
            onAttentionSwitchCountChange(Number(event.currentTarget.value))
          }
        />
      </label>

      <fieldset>
        <legend>可见产物</legend>
        <div className="chip-grid">
          {productLabels.map((label) => (
            <button
              key={label.id}
              className={
                values.productLabelIds.includes(label.id) ? "chip selected" : "chip"
              }
              style={{ "--chip-color": label.color } as React.CSSProperties}
              type="button"
              onClick={() => toggleProduct(label.id)}
            >
              {label.name}
            </button>
          ))}
        </div>
        <textarea
          value={values.productNote}
          placeholder="这轮实际产出了什么？"
          onChange={(event) => onProductNoteChange(event.currentTarget.value)}
        />
      </fieldset>

      <fieldset>
        <legend>不专注原因</legend>
        <div className="chip-grid">
          {blockerLabels.map((label) => (
            <button
              key={label.id}
              className={
                values.blockerLabelIds.includes(label.id) ? "chip selected" : "chip"
              }
              style={{ "--chip-color": label.color } as React.CSSProperties}
              type="button"
              onClick={() => toggleBlocker(label)}
            >
              {label.name}
            </button>
          ))}
        </div>
        <textarea
          value={values.blockerNote}
          placeholder="可选：补充说明不专注原因"
          onChange={(event) => onBlockerNoteChange(event.currentTarget.value)}
        />
      </fieldset>
    </>
  );
}

function ReviewModal({
  focusSession,
  labels,
  breakBalance,
  onSubmit,
}: {
  focusSession: FocusSessionRecord;
  labels: LabelRecord[];
  breakBalance: number;
  onSubmit: (input: SubmitSessionReviewInput) => Promise<void>;
}) {
  const statusLabels = activeLabelsByType(labels, "session_status");
  const noneBlocker = getNoneBlockerLabel(labels);
  const [statusLabelId, setStatusLabelId] = useState(statusLabels[0]?.id ?? "");
  const [attentionSwitchCount, setAttentionSwitchCount] = useState(0);
  const [productLabelIds, setProductLabelIds] = useState<Id[]>([]);
  const [productNote, setProductNote] = useState("");
  const [blockerLabelIds, setBlockerLabelIds] = useState<Id[]>(
    noneBlocker ? [noneBlocker.id] : [],
  );
  const [blockerNote, setBlockerNote] = useState("");
  const [breakChoice, setBreakChoice] =
    useState<SubmitSessionReviewInput["breakChoice"]>("save_for_later");
  const availableBreakBalance = Math.max(0, Math.floor(breakBalance));
  const [breakMinutesUsed, setBreakMinutesUsed] = useState(
    Math.min(
      availableBreakBalance,
      focusSession.earned_break_minutes > 0 ? focusSession.earned_break_minutes : 5,
    ),
  );
  const [error, setError] = useState("");
  const reviewValues: ReviewFormValues = {
    statusLabelId,
    attentionSwitchCount,
    productLabelIds,
    productNote,
    blockerLabelIds,
    blockerNote,
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="review-modal"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!statusLabelId) {
            setError("请选择本轮状态。");
            return;
          }

          const finalBlockerIds =
            blockerLabelIds.length > 0
              ? blockerLabelIds
              : noneBlocker
                ? [noneBlocker.id]
                : [];

          try {
            await onSubmit({
              focusSessionId: focusSession.id,
              statusLabelId,
              attentionSwitchCount,
              productLabelIds,
              productNote,
              blockerLabelIds: finalBlockerIds,
              blockerNote,
              breakChoice,
              breakMinutesUsed:
                breakChoice === "use_now" ? breakMinutesUsed : undefined,
            });
          } catch (submitError) {
            setError(
              submitError instanceof Error ? submitError.message : "复盘保存失败。",
            );
          }
        }}
      >
        <div className="panel-heading">
          <div>
            <h2>本轮复盘</h2>
            <p>
              本轮 {focusSession.actual_duration_minutes ?? focusSession.planned_duration_minutes}{" "}
              分钟，获得 {focusSession.earned_break_minutes} 分钟休息。
            </p>
          </div>
          <CheckCircle2 size={24} />
        </div>

        {error ? <div className="form-error">{error}</div> : null}

        <ReviewFormFields
          labels={labels}
          values={reviewValues}
          onStatusLabelChange={setStatusLabelId}
          onAttentionSwitchCountChange={setAttentionSwitchCount}
          onProductLabelIdsChange={setProductLabelIds}
          onProductNoteChange={setProductNote}
          onBlockerLabelIdsChange={setBlockerLabelIds}
          onBlockerNoteChange={setBlockerNote}
        />

        <fieldset>
          <legend>休息提醒</legend>
          <p className="fieldset-hint">
            使用休息会启动倒计时；提前结束时，未用完的分钟会退回余额。
          </p>
          <div className="break-options">
            <label>
              <input
                checked={breakChoice === "save_for_later"}
                name="break-choice"
                type="radio"
                onChange={() => setBreakChoice("save_for_later")}
              />
              保留休息
            </label>
            <label>
              <input
                checked={breakChoice === "use_now"}
                disabled={availableBreakBalance <= 0}
                name="break-choice"
                type="radio"
                onChange={() => setBreakChoice("use_now")}
              />
              使用休息
            </label>
          </div>
          <label>
            休息倒计时分钟数
            <input
              disabled={breakChoice !== "use_now"}
              max={availableBreakBalance}
              min={1}
              type="number"
              value={breakMinutesUsed}
              onChange={(event) =>
                setBreakMinutesUsed(Number(event.currentTarget.value))
              }
            />
          </label>
        </fieldset>

        <button className="primary-button full-width" type="submit">
          <Save size={18} />
          保存复盘
        </button>
      </form>
    </div>
  );
}

function EditReviewModal({
  entry,
  labels,
  onSubmit,
  onCancel,
}: {
  entry: AnalyticsSummary["reviewEntries"][number];
  labels: LabelRecord[];
  onSubmit: (input: UpdateSessionReviewInput) => Promise<void>;
  onCancel: () => void;
}) {
  const noneBlocker = getNoneBlockerLabel(labels);
  const [values, setValues] = useState<ReviewFormValues>({
    statusLabelId: entry.statusLabelId,
    attentionSwitchCount: entry.attentionSwitchCount,
    productLabelIds: entry.productLabelIds,
    productNote: entry.productNote ?? "",
    blockerLabelIds:
      entry.blockerLabelIds.length > 0
        ? entry.blockerLabelIds
        : noneBlocker
          ? [noneBlocker.id]
          : [],
    blockerNote: entry.blockerNote ?? "",
  });
  const [error, setError] = useState("");

  function patchValues(patch: Partial<ReviewFormValues>) {
    setValues((current) => ({ ...current, ...patch }));
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="review-modal"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!values.statusLabelId) {
            setError("请选择本轮状态。");
            return;
          }

          const finalBlockerIds =
            values.blockerLabelIds.length > 0
              ? values.blockerLabelIds
              : noneBlocker
                ? [noneBlocker.id]
                : [];

          try {
            await onSubmit({
              reviewId: entry.id,
              statusLabelId: values.statusLabelId,
              attentionSwitchCount: values.attentionSwitchCount,
              productLabelIds: values.productLabelIds,
              productNote: values.productNote,
              blockerLabelIds: finalBlockerIds,
              blockerNote: values.blockerNote,
            });
          } catch (submitError) {
            setError(
              submitError instanceof Error ? submitError.message : "复盘更新失败。",
            );
          }
        }}
      >
        <div className="panel-heading">
          <div>
            <h2>编辑复盘记录</h2>
            <p>
              只修改这条记录的复盘参数，不改变专注时长、休息余额或计时记录。
            </p>
          </div>
          <button
            aria-label="关闭编辑"
            className="icon-button"
            type="button"
            onClick={onCancel}
          >
            <X size={20} />
          </button>
        </div>

        {error ? <div className="form-error">{error}</div> : null}

        <ReviewFormFields
          labels={labels}
          values={values}
          onStatusLabelChange={(statusLabelId) => patchValues({ statusLabelId })}
          onAttentionSwitchCountChange={(attentionSwitchCount) =>
            patchValues({ attentionSwitchCount })
          }
          onProductLabelIdsChange={(productLabelIds) =>
            patchValues({ productLabelIds })
          }
          onProductNoteChange={(productNote) => patchValues({ productNote })}
          onBlockerLabelIdsChange={(blockerLabelIds) =>
            patchValues({ blockerLabelIds })
          }
          onBlockerNoteChange={(blockerNote) => patchValues({ blockerNote })}
        />

        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>
            取消
          </button>
          <button className="primary-button" type="submit">
            <Save size={18} />
            保存修改
          </button>
        </div>
      </form>
    </div>
  );
}

function BreakCompletionModal({
  breakBalance,
  onExtendBreak,
  onStartLearning,
}: {
  breakBalance: number;
  onExtendBreak: (minutes: number) => Promise<void>;
  onStartLearning: () => Promise<void>;
}) {
  const maxMinutes = Math.max(0, Math.floor(breakBalance));
  const defaultCustomMinutes = Math.min(5, Math.max(1, maxMinutes));
  const [customMinutes, setCustomMinutes] = useState(defaultCustomMinutes);
  const [error, setError] = useState("");
  const canUseFiveMinutes = maxMinutes >= 5;

  async function extendBreak(minutes: number) {
    const normalizedMinutes = Math.round(minutes);
    if (!Number.isFinite(normalizedMinutes) || normalizedMinutes <= 0) {
      setError("休息分钟数必须大于 0。");
      return;
    }

    if (normalizedMinutes > maxMinutes) {
      setError("休息分钟数不能超过当前剩余休息余额。");
      return;
    }

    setError("");
    await onExtendBreak(normalizedMinutes);
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="review-modal break-completion-modal"
        onSubmit={(event) => {
          event.preventDefault();
          void extendBreak(customMinutes);
        }}
      >
        <div className="panel-heading">
          <div>
            <h2>休息结束</h2>
            <p>当前还有 {formatMinutes(maxMinutes)} 可用休息。</p>
          </div>
          <Clock size={24} />
        </div>

        {error ? <div className="form-error">{error}</div> : null}

        <div className="break-extension-grid">
          <button
            className="secondary-button"
            disabled={!canUseFiveMinutes}
            type="button"
            onClick={() => void extendBreak(5)}
          >
            继续休息 5 分钟
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void extendBreak(maxMinutes)}
          >
            使用全部 {formatMinutes(maxMinutes)}
          </button>
        </div>

        <label>
          自定义休息分钟
          <input
            max={maxMinutes}
            min={1}
            type="number"
            value={customMinutes}
            onChange={(event) => setCustomMinutes(Number(event.currentTarget.value))}
          />
        </label>

        <div className="button-row two-actions">
          <button className="secondary-button" type="submit">
            自定义休息
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => void onStartLearning()}
          >
            开始学习
          </button>
        </div>
      </form>
    </div>
  );
}

function WeekTimelineView({
  snapshot,
  now,
}: {
  snapshot: AppSnapshot;
  now: Date;
}) {
  const [anchorDate, setAnchorDate] = useState(toLocalDate());
  const weekDates = useMemo(() => getWeekDates(anchorDate), [anchorDate]);
  const weekStart = weekDates[0] ?? anchorDate;
  const weekEnd = weekDates[6] ?? anchorDate;
  const dayTimelines = useMemo(
    () =>
      weekDates.map((date) => ({
        date,
        cells: buildDayTimeline(snapshot, date, now),
        timeZoneLabel: getTimelineTimeZoneLabel(snapshot, date),
      })),
    [now, snapshot, weekDates],
  );

  return (
    <main className="week-timeline-layout">
      <section className="panel week-timeline-header">
        <div className="panel-heading">
          <div>
            <h2>周点阵</h2>
            <p>
              {weekStart} 到 {weekEnd}
            </p>
          </div>
          <div className="timeline-controls" aria-label="周点阵日期控制">
            <button
              className="ghost-button"
              type="button"
              onClick={() => setAnchorDate((date) => shiftLocalDate(date, -7))}
            >
              <ChevronLeft size={16} />
              上一周
            </button>
            <label>
              日期
              <input
                aria-label="周点阵日期"
                type="date"
                value={anchorDate}
                onChange={(event) => {
                  const nextDate = event.currentTarget.value;
                  if (isLocalDateString(nextDate)) {
                    setAnchorDate(nextDate);
                  }
                }}
              />
            </label>
            <button
              className="ghost-button"
              type="button"
              onClick={() => setAnchorDate((date) => shiftLocalDate(date, 7))}
            >
              下一周
              <ChevronRight size={16} />
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setAnchorDate(toLocalDate())}
            >
              本周
            </button>
          </div>
        </div>
      </section>

      <section className="week-timeline-list" aria-label="一周日点阵">
        {dayTimelines.map((timeline) => (
          <WeekTimelineDay key={timeline.date} {...timeline} />
        ))}
      </section>
    </main>
  );
}

function WeekTimelineDay({
  cells,
  date,
  timeZoneLabel,
}: {
  cells: DayTimelineCell[];
  date: string;
  timeZoneLabel: string | null;
}) {
  const [panelRef, panelWidth] = useElementWidth<HTMLElement>();
  const { columns, durationMsByState, mode } = getTimelineLayout(
    cells,
    panelWidth,
    720,
  );
  const weekday = formatWeekday(date);

  return (
    <article
      ref={panelRef}
      className={`week-timeline-day day-dot-panel ${mode}`}
      style={{ "--timeline-columns": columns.length } as React.CSSProperties}
    >
      <div className="week-day-heading">
        <div>
          <h3>
            {date}
            <span>{weekday}</span>
          </h3>
          <p>
            每点 5 分钟 · 每列
            {mode === "half-hour" ? " 30 分钟" : " 1 小时"}
            {timeZoneLabel ? ` · ${timeZoneLabel}` : ""}
          </p>
        </div>
        <TimelineLegend durationMsByState={durationMsByState} />
      </div>
      <TimelineMatrix columns={columns} date={date} />
    </article>
  );
}

function AnalyticsView({
  snapshot,
  now,
  timelineColors,
  onChanged,
  onMessage,
}: {
  snapshot: AppSnapshot;
  now: Date;
  timelineColors: Record<DayTimelineCell["state"], string>;
  onChanged: () => Promise<void>;
  onMessage: (message: string) => void;
}) {
  const [grain, setGrain] = useState<AnalyticsGrain>("day");
  const [detailFilter, setDetailFilter] = useState<DetailFilter>(null);
  const [editingReviewEntry, setEditingReviewEntry] = useState<
    AnalyticsSummary["reviewEntries"][number] | null
  >(null);
  const [analyticsAnchorDate, setAnalyticsAnchorDate] = useState(() =>
    toLocalDate(now),
  );
  const analyticsRange = useMemo(
    () => getAnalyticsRange(grain, localDateToDate(analyticsAnchorDate)),
    [analyticsAnchorDate, grain],
  );
  const nowMinuteKey = Math.floor(now.getTime() / 60_000);
  const rangeNowByMinute = useMemo(
    () => new Date(nowMinuteKey * 60_000),
    [nowMinuteKey],
  );
  const showDailyDetails = grain === "day";
  const summaryNow = showDailyDetails ? now : rangeNowByMinute;
  const summary = useMemo<AnalyticsSummary>(
    () => buildAnalyticsSummary(snapshot, analyticsRange, summaryNow),
    [analyticsRange, snapshot, summaryNow],
  );
  const timelineDate = summary.range.startDate;
  const dailyDetailNow = showDailyDetails ? now : null;
  const dayTimeline = useMemo(
    () =>
      dailyDetailNow
        ? buildDayTimeline(snapshot, timelineDate, dailyDetailNow)
        : [],
    [dailyDetailNow, snapshot, timelineDate],
  );
  const dayTimelineTimeZoneLabel = useMemo(
    () =>
      showDailyDetails ? getTimelineTimeZoneLabel(snapshot, timelineDate) : null,
    [showDailyDetails, snapshot, timelineDate],
  );
  const statusData = buildCountData(summary.statusCounts, snapshot.labels);
  const productData = buildCountData(summary.productLabelCounts, snapshot.labels);
  const noneBlockerLabelId = getNoneBlockerLabel(snapshot.labels)?.id;
  const blockerData = buildCountData(summary.blockerLabelCounts, snapshot.labels).filter(
    (item) =>
      item.id !== "blocker-none" &&
      item.id !== noneBlockerLabelId &&
      item.name !== "无",
  );
  const selectedDetailLabel = showDailyDetails && detailFilter
    ? getDistributionData(detailFilter.type, statusData, productData, blockerData).find(
        (item) => item.id === detailFilter.id,
      )
    : undefined;
  const filteredReviewEntries = showDailyDetails && detailFilter
    ? summary.reviewEntries.filter((entry) =>
        matchesDetailFilter(entry, detailFilter),
      )
    : summary.reviewEntries;

  function toggleDetailFilter(type: LabelType, id: Id) {
    setDetailFilter((current) =>
      current?.type === type && current.id === id ? null : { type, id },
    );
  }

  useEffect(() => {
    if (!showDailyDetails) {
      if (detailFilter) {
        setDetailFilter(null);
      }
      return;
    }

    if (
      detailFilter &&
      !getDistributionData(detailFilter.type, statusData, productData, blockerData).some(
        (item) => item.id === detailFilter.id,
      )
    ) {
      setDetailFilter(null);
    }
  }, [blockerData, detailFilter, productData, showDailyDetails, statusData]);

  return (
    <main className="analytics-layout">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>统计</h2>
            <p>
              {summary.range.startDate} 到 {summary.range.endDate}
            </p>
          </div>
          <div className="analytics-toolbar">
            <div className="segmented-control">
              {(["day", "week", "month"] as AnalyticsGrain[]).map((item) => (
                <button
                  key={item}
                  className={grain === item ? "selected" : ""}
                  type="button"
                  onClick={() => {
                    setGrain(item);
                    setDetailFilter(null);
                  }}
                >
                  {item === "day" ? "日" : item === "week" ? "周" : "月"}
                </button>
              ))}
            </div>
            <AnalyticsRangeControls
              anchorDate={analyticsAnchorDate}
              grain={grain}
              onAnchorDateChange={setAnalyticsAnchorDate}
            />
          </div>
        </div>

        <div className="summary-strip">
          <StatCard label="专注时长" value={formatMinutes(summary.totalFocusMinutes)} />
          <StatCard label="不专注" value={formatMinutes(summary.totalBlockedMinutes)} />
          <StatCard
            label="拖延"
            value={formatMinutes(summary.totalStartupDelayMinutes)}
          />
          <StatCard label="切换次数" value={`${summary.totalAttentionSwitchCount} 次`} />
          <StatCard
            label="每小时切换"
            value={
              summary.attentionSwitchesPerFocusHour === null
                ? "暂无"
                : `${summary.attentionSwitchesPerFocusHour.toFixed(1)} 次`
            }
          />
          <StatCard
            label="平均精力"
            value={
              summary.averageEnergyScore === null
                ? "暂无"
                : `${summary.averageEnergyScore.toFixed(1)} / 5`
            }
          />
        </div>
      </section>

      <TimeSharePanel summary={summary} timelineColors={timelineColors} />

      {showDailyDetails ? (
        <DayTimelinePanel
          cells={dayTimeline}
          date={timelineDate}
          timeZoneLabel={dayTimelineTimeZoneLabel}
          showDateControls={false}
          onDateChange={(date) => {
            if (isLocalDateString(date)) {
              setAnalyticsAnchorDate(date);
            }
          }}
          onNextDate={() =>
            setAnalyticsAnchorDate((date) => shiftLocalDate(date, 1))
          }
          onPreviousDate={() =>
            setAnalyticsAnchorDate((date) => shiftLocalDate(date, -1))
          }
          onToday={() => setAnalyticsAnchorDate(toLocalDate())}
        />
      ) : null}

      <section className="panel chart-panel">
        <h3>专注、不专注与拖延</h3>
        <ResponsiveContainer height={260} width="100%">
          <BarChart data={summary.trend}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis />
            <Tooltip />
            <Bar
              dataKey="focusMinutes"
              fill={timelineColors.focus}
              name="专注"
            />
            <Bar
              dataKey="blockedMinutes"
              fill={timelineColors.blocked}
              name="不专注"
            />
            <Bar
              dataKey="startupDelayMinutes"
              fill={timelineColors.startup_delay}
              name="拖延"
            />
          </BarChart>
        </ResponsiveContainer>
      </section>

      {showDailyDetails ? (
        <DailySleepStatsPanel summary={summary} />
      ) : (
        <section className="panel chart-panel">
          <h3>睡眠与精力</h3>
          <ResponsiveContainer height={260} width="100%">
            <LineChart data={summary.trend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis />
              <Tooltip />
              <Line
                dataKey="sleepDurationHours"
                name="睡眠小时"
                stroke="#2b6cb0"
                strokeWidth={2}
                type="monotone"
              />
              <Line
                dataKey="energyScore"
                name="精力"
                stroke="#805ad5"
                strokeWidth={2}
                type="monotone"
              />
            </LineChart>
          </ResponsiveContainer>
        </section>
      )}

      <DistributionPanel
        title="状态分布"
        data={statusData}
        selectedId={
          showDailyDetails && detailFilter?.type === "session_status"
            ? detailFilter.id
            : null
        }
        onSelect={
          showDailyDetails
            ? (id) => toggleDetailFilter("session_status", id)
            : undefined
        }
      />
      <DistributionPanel
        title="产物标签"
        data={productData}
        selectedId={
          showDailyDetails && detailFilter?.type === "product" ? detailFilter.id : null
        }
        onSelect={
          showDailyDetails ? (id) => toggleDetailFilter("product", id) : undefined
        }
      />
      <DistributionPanel
        title="不专注原因"
        data={blockerData}
        emptyText="暂无不专注原因记录。"
        selectedId={
          showDailyDetails && detailFilter?.type === "blocker" ? detailFilter.id : null
        }
        onSelect={
          showDailyDetails ? (id) => toggleDetailFilter("blocker", id) : undefined
        }
      />

      {showDailyDetails ? (
        <section className="panel notes-panel">
          <div className="notes-panel-heading">
            <div>
              <h3>记录明细</h3>
              <p>
                {selectedDetailLabel
                  ? `当前只看「${selectedDetailLabel.name}」相关记录`
                  : "点击上方状态、产物或不专注原因图表，可筛选当天复盘记录。"}
              </p>
            </div>
            {selectedDetailLabel ? (
              <button
                className="ghost-button"
                type="button"
                onClick={() => setDetailFilter(null)}
              >
                全部
              </button>
            ) : null}
          </div>
          {filteredReviewEntries.length > 0 ? (
            <ul>
              {filteredReviewEntries.map((entry) => (
                <li key={entry.id}>
                  <div className="record-entry-heading">
                    <div className="record-meta">
                      <span>{entry.local_date}</span>
                      <strong>{entry.statusLabelName}</strong>
                      <em>{formatMinutes(entry.focusMinutes)}</em>
                      <em>{entry.attentionSwitchCount} 次切换</em>
                    </div>
                    <button
                      className="ghost-button compact-button"
                      type="button"
                      onClick={() => setEditingReviewEntry(entry)}
                    >
                      <SettingsIcon size={16} />
                      编辑
                    </button>
                  </div>
                  <div className="record-tags">
                    <span>产物：{entry.productLabelNames.join("、") || "未标记"}</span>
                    <span>不专注原因：{entry.blockerLabelNames.join("、") || "未标记"}</span>
                  </div>
                  {entry.productNote ? <p>产物记录：{entry.productNote}</p> : null}
                  {entry.blockerNote ? <p>不专注记录：{entry.blockerNote}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-text">
              {selectedDetailLabel
                ? `当天没有「${selectedDetailLabel.name}」相关复盘记录。`
                : "当天还没有复盘记录。"}
            </p>
          )}
        </section>
      ) : null}

      {editingReviewEntry ? (
        <EditReviewModal
          entry={editingReviewEntry}
          labels={snapshot.labels}
          onCancel={() => setEditingReviewEntry(null)}
          onSubmit={async (input) => {
            await updateSessionReview(input);
            await onChanged();
            setEditingReviewEntry(null);
            onMessage("复盘记录已更新。");
          }}
        />
      ) : null}
    </main>
  );
}

function AnalyticsRangeControls({
  anchorDate,
  grain,
  onAnchorDateChange,
}: {
  anchorDate: string;
  grain: AnalyticsGrain;
  onAnchorDateChange: (date: string) => void;
}) {
  const isDay = grain === "day";
  const isWeek = grain === "week";
  const inputType = grain === "month" ? "month" : "date";
  const inputLabel = grain === "month" ? "月份" : "日期";
  const previousLabel = isDay ? "前一天" : isWeek ? "上一周" : "上一月";
  const nextLabel = isDay ? "后一天" : isWeek ? "下一周" : "下一月";
  const currentLabel = isDay ? "今天" : isWeek ? "本周" : "本月";

  function shiftAnchor(direction: -1 | 1) {
    if (isDay) {
      return shiftLocalDate(anchorDate, direction);
    }

    if (isWeek) {
      return shiftLocalDate(anchorDate, direction * 7);
    }

    return shiftLocalMonth(anchorDate, direction);
  }

  return (
    <div className="analytics-range-controls">
      <button
        className="ghost-button"
        type="button"
        onClick={() => onAnchorDateChange(shiftAnchor(-1))}
      >
        <ChevronLeft size={16} />
        {previousLabel}
      </button>
      <label>
        {inputLabel}
        <input
          aria-label={grain === "month" ? "统计月份" : "统计日期"}
          type={inputType}
          value={grain === "month" ? anchorDate.slice(0, 7) : anchorDate}
          onChange={(event) => {
            const nextValue = event.currentTarget.value;
            const nextDate = grain === "month" ? `${nextValue}-01` : nextValue;

            if (isLocalDateString(nextDate)) {
              onAnchorDateChange(nextDate);
            }
          }}
        />
      </label>
      <button
        className="ghost-button"
        type="button"
        onClick={() => onAnchorDateChange(shiftAnchor(1))}
      >
        {nextLabel}
        <ChevronRight size={16} />
      </button>
      <button
        className="secondary-button"
        type="button"
        onClick={() => onAnchorDateChange(toLocalDate())}
      >
        {currentLabel}
      </button>
    </div>
  );
}

function DailySleepStatsPanel({ summary }: { summary: AnalyticsSummary }) {
  return (
    <section className="panel daily-sleep-panel">
      <h3>睡眠</h3>
      <div className="daily-sleep-grid">
        <StatCard
          label="睡眠时长"
          value={
            summary.averageSleepDurationMinutes === null
              ? "暂无"
              : formatMinutes(summary.averageSleepDurationMinutes)
          }
        />
        <StatCard
          label="精力"
          value={
            summary.averageEnergyScore === null
              ? "暂无"
              : `${summary.averageEnergyScore.toFixed(1)} / 5`
          }
        />
      </div>
    </section>
  );
}

function TimeSharePanel({
  summary,
  timelineColors,
}: {
  summary: AnalyticsSummary;
  timelineColors: Record<DayTimelineCell["state"], string>;
}) {
  const items = [
    {
      key: "focus" as const,
      label: "专注",
      minutes: summary.totalFocusMinutes,
      color: timelineColors.focus,
    },
    {
      key: "blocked" as const,
      label: "不专注",
      minutes: summary.totalBlockedMinutes,
      color: timelineColors.blocked,
    },
    {
      key: "startup_delay" as const,
      label: "拖延",
      minutes: summary.totalStartupDelayMinutes,
      color: timelineColors.startup_delay,
    },
  ];
  const totalMinutes = items.reduce((sum, item) => sum + item.minutes, 0);

  return (
    <section className="panel time-share-panel">
      <div className="panel-heading">
        <div>
          <h3>时间占比</h3>
          <p>专注 + 不专注 + 拖延 = 100%，休息不进入分母。</p>
        </div>
        <strong>{totalMinutes > 0 ? formatMinutes(totalMinutes) : "暂无"}</strong>
      </div>
      {totalMinutes > 0 ? (
        <>
          <div className="time-share-bar" aria-label="专注、不专注和拖延时间占比">
            {items.map((item) => {
              const percent = (item.minutes / totalMinutes) * 100;

              return (
                <span
                  key={item.key}
                  style={
                    {
                      "--share-width": `${percent}%`,
                      "--share-color": item.color,
                    } as React.CSSProperties
                  }
                  title={`${item.label} ${formatMinutes(item.minutes)} · ${formatPercent(percent)}`}
                />
              );
            })}
          </div>
          <ul className="time-share-list">
            {items.map((item) => {
              const percent = (item.minutes / totalMinutes) * 100;

              return (
                <li key={item.key}>
                  <i style={{ background: item.color }} />
                  <span>{item.label}</span>
                  <strong>{formatPercent(percent)}</strong>
                  <em>{formatMinutes(item.minutes)}</em>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="empty-text">这个时间范围内暂无专注、不专注或拖延记录。</p>
      )}
    </section>
  );
}

function getDistributionData(
  type: LabelType,
  statusData: { id: Id; name: string; value: number; color?: string }[],
  productData: { id: Id; name: string; value: number; color?: string }[],
  blockerData: { id: Id; name: string; value: number; color?: string }[],
) {
  if (type === "session_status") {
    return statusData;
  }

  if (type === "product") {
    return productData;
  }

  return blockerData;
}

function matchesDetailFilter(
  entry: AnalyticsSummary["reviewEntries"][number],
  filter: NonNullable<DetailFilter>,
) {
  if (filter.type === "session_status") {
    return entry.statusLabelId === filter.id;
  }

  if (filter.type === "product") {
    return entry.productLabelIds.includes(filter.id);
  }

  return entry.blockerLabelIds.includes(filter.id);
}

function DayTimelinePanel({
  cells,
  date,
  timeZoneLabel,
  showDateControls = true,
  onDateChange,
  onNextDate,
  onPreviousDate,
  onToday,
}: {
  cells: DayTimelineCell[];
  date: string;
  timeZoneLabel: string | null;
  showDateControls?: boolean;
  onDateChange: (date: string | null) => void;
  onNextDate: () => void;
  onPreviousDate: () => void;
  onToday: () => void;
}) {
  const [panelRef, panelWidth] = useElementWidth<HTMLElement>();
  const { columns, durationMsByState, mode } = getTimelineLayout(cells, panelWidth);

  return (
    <section
      ref={panelRef}
      className={`panel day-dot-panel ${mode}`}
      style={{ "--timeline-columns": columns.length } as React.CSSProperties}
    >
      <div className="notes-panel-heading">
        <div>
          <h3>日点阵</h3>
          <p>
            {date}
            {timeZoneLabel ? ` · ${timeZoneLabel}` : ""} · 每点 5 分钟 · 每列
            {mode === "half-hour" ? " 30 分钟" : " 1 小时"}
          </p>
        </div>
        <div className="timeline-actions">
          {showDateControls ? (
            <div className="timeline-controls" aria-label="点阵日期控制">
              <button className="ghost-button" type="button" onClick={onPreviousDate}>
                <ChevronLeft size={16} />
                前一天
              </button>
              <label>
                日期
                <input
                  aria-label="点阵日期"
                  type="date"
                  value={date}
                  onChange={(event) => {
                    const nextDate = event.currentTarget.value;
                    onDateChange(nextDate || null);
                  }}
                />
              </label>
              <button className="ghost-button" type="button" onClick={onNextDate}>
                后一天
                <ChevronRight size={16} />
              </button>
              <button className="secondary-button" type="button" onClick={onToday}>
                今天
              </button>
            </div>
          ) : null}
          <TimelineLegend durationMsByState={durationMsByState} />
        </div>
      </div>
      <TimelineMatrix columns={columns} date={date} />
    </section>
  );
}

function TimelineLegend({
  durationMsByState,
}: {
  durationMsByState: Record<DayTimelineCell["state"], number>;
}) {
  return (
    <div className="dot-legend" aria-label="日点阵图例">
      <span>
        <i className="day-dot startup_delay" />
        拖延 {formatTimelineLegendDuration(durationMsByState.startup_delay)}
      </span>
      <span>
        <i className="day-dot break" />
        休息 {formatTimelineLegendDuration(durationMsByState.break)}
      </span>
      <span>
        <i className="day-dot focus" />
        专注 {formatTimelineLegendDuration(durationMsByState.focus)}
      </span>
      <span>
        <i className="day-dot blocked" />
        不专注 {formatTimelineLegendDuration(durationMsByState.blocked)}
      </span>
    </div>
  );
}

function TimelineMatrix({
  columns,
  date,
}: {
  columns: DayTimelineCell[][];
  date: string;
}) {
  return (
    <div className="day-dot-scroll">
      <div className="day-dot-grid" aria-label={`${date} 日点阵`}>
        {columns.map((column, columnIndex) => (
          <div className="day-dot-column" key={`${date}-${columnIndex}`}>
            {column.map((cell) => (
              <span
                key={cell.id}
                aria-label={`${cell.timeLabel} ${timelineCellLabel(cell.state)}`}
                className={`day-dot ${cell.state}`}
                style={getTimelineCellStyle(cell)}
                title={cell.title}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="hour-axis" aria-hidden="true">
        {Array.from({ length: 24 }, (_, hour) => (
          <span key={hour}>{String(hour).padStart(2, "0")}</span>
        ))}
      </div>
    </div>
  );
}

function getTimelineLayout(
  cells: DayTimelineCell[],
  panelWidth: number,
  halfHourThreshold = 820,
) {
  const slotsPerColumn = panelWidth >= halfHourThreshold ? 6 : 12;
  const mode = slotsPerColumn === 6 ? "half-hour" : "hour";

  return {
    columns: Array.from(
      { length: Math.ceil(cells.length / slotsPerColumn) },
      (_, columnIndex) =>
        cells.slice(
          columnIndex * slotsPerColumn,
          columnIndex * slotsPerColumn + slotsPerColumn,
        ),
    ),
    durationMsByState: sumTimelineCellDurations(cells),
    mode,
  };
}

function formatTimelineLegendDuration(durationMs: number) {
  return formatMinutes(durationMs / 60_000);
}

function formatPercent(value: number): string {
  if (value > 0 && value < 1) {
    return "< 1%";
  }

  return `${Math.round(value)}%`;
}

function getTimelineCellStyle(cell: DayTimelineCell): React.CSSProperties {
  return { background: getTimelineCellBackground(cell) };
}

function getTimelineCellBackground(cell: DayTimelineCell): string {
  if (cell.parts.length <= 1) {
    return timelineColorCssVar(cell.parts[0]?.state ?? cell.state);
  }

  const stops = cell.parts.flatMap((part) => {
    const color = timelineColorCssVar(part.state);
    const start = `${Math.max(0, Math.min(1, part.startRatio)) * 100}%`;
    const end = `${Math.max(0, Math.min(1, part.endRatio)) * 100}%`;
    return [`${color} ${start}`, `${color} ${end}`];
  });

  return `linear-gradient(to bottom, ${stops.join(", ")})`;
}

function timelineColorCssVar(state: DayTimelineCell["state"]): string {
  if (state === "startup_delay") {
    return "var(--timeline-color-startup-delay)";
  }

  if (state === "break") {
    return "var(--timeline-color-break)";
  }

  if (state === "focus") {
    return "var(--timeline-color-focus)";
  }

  if (state === "blocked") {
    return "var(--timeline-color-blocked)";
  }

  return "var(--timeline-color-empty)";
}

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const observedElement: T = element;

    function updateWidth() {
      setWidth(observedElement.getBoundingClientRect().width);
    }

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(observedElement);

    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

function timelineCellLabel(state: DayTimelineCell["state"]) {
  if (state === "startup_delay") {
    return "拖延";
  }

  if (state === "break") {
    return "休息";
  }

  if (state === "blocked") {
    return "不专注";
  }

  if (state === "focus") {
    return "专注";
  }

  return "空白";
}

function DistributionPanel({
  title,
  data,
  emptyText = "暂无数据。",
  selectedId,
  onSelect,
}: {
  title: string;
  data: { id: Id; name: string; value: number; color?: string }[];
  emptyText?: string;
  selectedId?: Id | null;
  onSelect?: (id: Id) => void;
}) {
  return (
    <section className="panel chart-panel distribution-panel">
      <h3>{title}</h3>
      {data.length > 0 ? (
        <div className="distribution-grid">
          <ResponsiveContainer height={220} width="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                outerRadius="72%"
              >
                {data.map((item) => (
                  <Cell
                    key={item.id}
                    className={onSelect ? "clickable-pie-cell" : undefined}
                    fill={item.color ?? "#4a5568"}
                    fillOpacity={!selectedId || selectedId === item.id ? 1 : 0.36}
                    onClick={onSelect ? () => onSelect(item.id) : undefined}
                    stroke={selectedId === item.id ? "#1d232a" : "#fffdfa"}
                    strokeWidth={selectedId === item.id ? 3 : 1}
                  />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <ul className="distribution-list">
            {data.map((item) => (
              <li
                key={item.id}
                className={selectedId === item.id ? "selected" : ""}
              >
                {onSelect ? (
                  <button
                    className="distribution-filter-button"
                    type="button"
                    onClick={() => onSelect(item.id)}
                  >
                    <DistributionLegendContent item={item} />
                  </button>
                ) : (
                  <DistributionLegendContent item={item} />
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="empty-text">{emptyText}</p>
      )}
    </section>
  );
}

function DistributionLegendContent({
  item,
}: {
  item: { id: Id; name: string; value: number; color?: string };
}) {
  return (
    <>
      <span
        className="legend-dot"
        style={{ backgroundColor: item.color ?? "#4a5568" }}
      />
      <span className="legend-label">{item.name}</span>
      <strong>{item.value}</strong>
    </>
  );
}

function SettingsView({
  snapshot,
  timelineColors,
  onChanged,
  onMessage,
}: {
  snapshot: AppSnapshot;
  timelineColors: Record<DayTimelineCell["state"], string>;
  onChanged: () => Promise<void>;
  onMessage: (message: string) => void;
}) {
  const [timelineDraft, setTimelineDraft] = useState(timelineColors);
  const [editor, setEditor] = useState<LabelEditorState | null>(null);
  const usageCounts = useMemo(() => getLabelUsageCounts(snapshot), [snapshot]);

  useEffect(() => {
    setTimelineDraft(timelineColors);
  }, [timelineColors]);

  async function handleSaveTimelineColors(event: React.FormEvent) {
    event.preventDefault();
    try {
      await updateAppSetting(timelineColorSettingKey, normalizeTimelineColors(timelineDraft));
      await onChanged();
      onMessage("点阵颜色已保存。");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "保存颜色失败。");
    }
  }

  return (
    <main className="labels-layout">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>点阵颜色</h2>
            <p>调整日点阵和周点阵里的状态颜色。</p>
          </div>
          <Palette size={22} />
        </div>

        <form className="timeline-color-form" onSubmit={handleSaveTimelineColors}>
          <div className="timeline-color-grid">
            {timelineColorItems.map((item) => {
              const color = normalizeTimelineColorValue(
                timelineDraft[item.key],
                defaultTimelineColors[item.key],
              );
              return (
                <label className="timeline-color-row" key={item.key}>
                  <span
                    className={`day-dot ${item.key}`}
                    style={{ backgroundColor: color }}
                  />
                  <strong>{item.label}</strong>
                  <input
                    aria-label={`${item.label}颜色`}
                    type="color"
                    value={color}
                    onChange={(event) =>
                      setTimelineDraft((current) => ({
                        ...current,
                        [item.key]: event.currentTarget.value,
                      }))
                    }
                  />
                  <input
                    aria-label={`${item.label}颜色值`}
                    value={timelineDraft[item.key]}
                    onChange={(event) =>
                      setTimelineDraft((current) => ({
                        ...current,
                        [item.key]: event.currentTarget.value,
                      }))
                    }
                  />
                </label>
              );
            })}
          </div>
          <button className="primary-button settings-save-button" type="submit">
            <Save size={18} />
            保存颜色
          </button>
        </form>
      </section>

      {labelSections.map((section) => (
        <section className="panel label-section" key={section.type}>
          <div className="label-section-heading">
            <div>
              <h3>{section.title}</h3>
              <p>{section.description}</p>
            </div>
            <button
              className="primary-button"
              type="button"
              onClick={() => setEditor({ mode: "create", type: section.type })}
            >
              <Plus size={18} />
              新增
            </button>
          </div>
          <div className="label-list">
            {snapshot.labels
              .filter((label) => label.type === section.type && !label.deleted_at)
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((label) => (
                <LabelSummaryRow
                  key={label.id}
                  label={label}
                  usageCount={usageCounts.get(label.id) ?? 0}
                  onSettings={() => setEditor({ mode: "edit", label })}
                />
              ))}
          </div>
        </section>
      ))}

      {editor ? (
        <LabelSettingsDialog
          editor={editor}
          usageCount={
            editor.mode === "edit" ? usageCounts.get(editor.label.id) ?? 0 : 0
          }
          onClose={() => setEditor(null)}
          onChanged={onChanged}
          onMessage={onMessage}
        />
      ) : null}
    </main>
  );
}

type LabelEditorState =
  | { mode: "create"; type: LabelType }
  | { mode: "edit"; label: LabelRecord };

function LabelSummaryRow({
  label,
  usageCount,
  onSettings,
}: {
  label: LabelRecord;
  usageCount: number;
  onSettings: () => void;
}) {
  return (
    <div className={label.is_active ? "label-row" : "label-row inactive"}>
      <span className="label-color" style={{ backgroundColor: label.color }} />
      <span className="label-row-name">{label.name}</span>
      <span className={label.is_active ? "label-state-badge" : "label-state-badge archived"}>
        {label.is_active ? "正常" : "已归档"}
      </span>
      <span className="label-usage">{usageCount} 条记录</span>
      <button
        aria-label={`设置 ${label.name}`}
        className="icon-button"
        type="button"
        onClick={onSettings}
      >
        <SettingsIcon size={18} />
      </button>
    </div>
  );
}

function LabelSettingsDialog({
  editor,
  usageCount,
  onClose,
  onChanged,
  onMessage,
}: {
  editor: LabelEditorState;
  usageCount: number;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onMessage: (message: string) => void;
}) {
  const isEditing = editor.mode === "edit";
  const sourceLabel = isEditing ? editor.label : null;
  const labelType = editor.mode === "edit" ? editor.label.type : editor.type;
  const isFocusStatusLabel = sourceLabel?.id === focusStatusLabelId;
  const [name, setName] = useState(sourceLabel?.name ?? "");
  const [color, setColor] = useState(sourceLabel?.color ?? defaultLabelColor(labelType));

  useEffect(() => {
    setName(sourceLabel?.name ?? "");
    setColor(sourceLabel?.color ?? defaultLabelColor(labelType));
  }, [sourceLabel, labelType]);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    try {
      if (isEditing && sourceLabel) {
        await updateLabel({
          labelId: sourceLabel.id,
          name,
          color,
        });
        onMessage("标签设置已保存。");
      } else {
        await createLabel(labelType, name, color);
        onMessage("标签已新增。");
      }
      await onChanged();
      onClose();
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "保存失败。");
    }
  }

  async function handleArchiveToggle() {
    if (!sourceLabel) {
      return;
    }

    try {
      await updateLabel({
        labelId: sourceLabel.id,
        isActive: !sourceLabel.is_active,
      });
      await onChanged();
      onClose();
      onMessage(sourceLabel.is_active ? "标签已归档。" : "标签已解除归档。");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "操作失败。");
    }
  }

  async function handleDelete() {
    if (!sourceLabel) {
      return;
    }

    if (!window.confirm(`确定删除「${sourceLabel.name}」吗？`)) {
      return;
    }

    try {
      await deleteLabel(sourceLabel.id);
      await onChanged();
      onClose();
      onMessage("标签已删除。");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "删除失败。");
    }
  }

  const normalizedColor = normalizeTimelineColorValue(
    color,
    defaultLabelColor(labelType),
  );

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="label-settings-modal" onSubmit={handleSave}>
        <div className="panel-heading">
          <div>
            <h2>{isEditing ? "标签设置" : `新增${typeLabel(labelType)}标签`}</h2>
            <p>{typeLabel(labelType)}</p>
          </div>
          <button
            aria-label="关闭标签设置"
            className="icon-button"
            type="button"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <label>
          名称
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
        </label>

        <label>
          颜色
          <div className="label-color-editor">
            <span
              className="label-color-preview"
              style={{ backgroundColor: normalizedColor }}
            />
            <input
              aria-label="标签颜色"
              type="color"
              value={normalizedColor}
              onChange={(event) => setColor(event.currentTarget.value)}
            />
            <input
              aria-label="标签颜色值"
              value={color}
              onChange={(event) => setColor(event.currentTarget.value)}
            />
          </div>
        </label>

        <div className="color-swatch-grid" aria-label="颜色预设">
          {labelColorPresets.map((preset) => (
            <button
              aria-label={`使用颜色 ${preset}`}
              className={normalizedColor === preset ? "color-swatch selected" : "color-swatch"}
              key={preset}
              style={{ backgroundColor: preset }}
              type="button"
              onClick={() => setColor(preset)}
            />
          ))}
        </div>

        {isEditing ? (
          <div className="label-settings-meta">
            <span className={sourceLabel?.is_active ? "label-state-badge" : "label-state-badge archived"}>
              {sourceLabel?.is_active ? "正常" : "已归档"}
            </span>
            <span>{usageCount} 条历史记录</span>
          </div>
        ) : null}

        {isFocusStatusLabel ? (
          <div className="label-settings-note">
            这个状态和点阵里的“专注”绑定：选择它的复盘会显示为绿色。它可以改名和改颜色，但不能归档或删除。
          </div>
        ) : null}

        <div className="label-settings-actions">
          <button className="primary-button" type="submit">
            <Save size={18} />
            保存
          </button>
          {sourceLabel && !isFocusStatusLabel ? (
            <button
              className="secondary-button"
              type="button"
              onClick={handleArchiveToggle}
            >
              {sourceLabel.is_active ? (
                <>
                  <Archive size={18} />
                  归档
                </>
              ) : (
                <>
                  <ArchiveRestore size={18} />
                  解除归档
                </>
              )}
            </button>
          ) : null}
          {sourceLabel ? (
            <button
              className="danger-button"
              disabled={isFocusStatusLabel || usageCount > 0}
              title={
                isFocusStatusLabel
                  ? "这个状态和专注判定绑定，不能删除"
                  : usageCount > 0
                    ? "已有历史记录的标签只能归档"
                    : undefined
              }
              type="button"
              onClick={handleDelete}
            >
              <Trash2 size={18} />
              删除
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

function getActiveFocusSession(
  sessions: FocusSessionRecord[],
): FocusSessionRecord | undefined {
  return sessions
    .filter((session) => !session.deleted_at && ["running", "paused"].includes(session.state))
    .sort(
      (a, b) =>
        new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
    )[0];
}

function getPendingReviewSession(
  sessions: FocusSessionRecord[],
): FocusSessionRecord | undefined {
  return sessions
    .filter((session) => !session.deleted_at && session.state === "completed")
    .sort(
      (a, b) =>
        new Date(b.completed_at ?? b.started_at).getTime() -
        new Date(a.completed_at ?? a.started_at).getTime(),
    )[0];
}

function getActiveBreakSession(
  sessions: BreakSessionRecord[],
): BreakSessionRecord | undefined {
  return sessions
    .filter((session) => session.state === "running")
    .sort(
      (a, b) =>
        new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
    )[0];
}

function getOpenArrival(
  arrivals: AppSnapshot["arrivalSessions"],
): AppSnapshot["arrivalSessions"][number] | undefined {
  return arrivals
    .filter((arrival) => !arrival.deleted_at && !arrival.left_at)
    .sort(
      (a, b) =>
        new Date(a.arrived_at).getTime() - new Date(b.arrived_at).getTime(),
    )[0];
}

function getRemainingSeconds(session: FocusSessionRecord, now: Date): number {
  const anchorIso =
    session.state === "paused" && session.current_pause_started_at
      ? session.current_pause_started_at
      : now.toISOString();
  const elapsedSeconds =
    secondsBetween(session.started_at, anchorIso) - session.paused_total_seconds;
  return session.planned_duration_minutes * 60 - elapsedSeconds;
}

function getBreakRemainingSeconds(session: BreakSessionRecord, now: Date): number {
  const elapsedSeconds = secondsBetween(session.started_at, now.toISOString());
  return session.planned_duration_minutes * 60 - elapsedSeconds;
}

function isLocalDateString(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsedDate = new Date(`${value}T00:00:00`);
  return !Number.isNaN(parsedDate.getTime()) && toLocalDate(parsedDate) === value;
}

function getTimelineTimeZoneLabel(
  snapshot: AppSnapshot,
  localDate: string,
): string | null {
  const zones = new Set<string>();

  snapshot.arrivalSessions
    .filter((arrival) => arrival.local_date === localDate && !arrival.deleted_at)
    .forEach((arrival) => zones.add(arrival.time_zone ?? fallbackTimeZone));
  snapshot.focusSessions
    .filter((session) => session.local_date === localDate && !session.deleted_at)
    .forEach((session) => zones.add(session.time_zone ?? fallbackTimeZone));
  snapshot.breakSessions
    .filter((session) => session.local_date === localDate && session.state !== "canceled")
    .forEach((session) => zones.add(session.time_zone ?? fallbackTimeZone));

  if (zones.size === 0) {
    return null;
  }

  if (zones.size === 1) {
    return `时区 ${Array.from(zones)[0]}`;
  }

  return `多时区 ${zones.size} 个`;
}

function localDateToDate(date: string): Date {
  return new Date(`${date}T00:00:00`);
}

function shiftLocalDate(date: string, dayDelta: number): string {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + dayDelta);
  return toLocalDate(value);
}

function shiftLocalMonth(date: string, monthDelta: number): string {
  const [year = 1970, month = 1, day = 1] = date.split("-").map(Number);
  const value = new Date(year, month - 1 + monthDelta, 1);
  const lastDayOfTargetMonth = new Date(
    value.getFullYear(),
    value.getMonth() + 1,
    0,
  ).getDate();

  value.setDate(Math.min(day, lastDayOfTargetMonth));
  return toLocalDate(value);
}

function getWeekDates(anchorDate: string): string[] {
  const start = getWeekStartDate(anchorDate);
  return Array.from({ length: 7 }, (_, index) => shiftLocalDate(start, index));
}

function getWeekStartDate(anchorDate: string): string {
  const value = new Date(`${anchorDate}T00:00:00`);
  const daysSinceMonday = (value.getDay() + 6) % 7;
  value.setDate(value.getDate() - daysSinceMonday);
  return toLocalDate(value);
}

function formatWeekday(localDate: string): string {
  return new Date(`${localDate}T00:00:00`).toLocaleDateString("zh-CN", {
    weekday: "short",
  });
}

function buildCountData(counts: Record<Id, number>, labels: LabelRecord[]) {
  return Object.entries(counts)
    .map(([id, value]) => {
      const label = labels.find((item) => item.id === id);
      return {
        id,
        name: label?.name ?? "未知标签",
        value,
        color: label?.color,
      };
    })
    .sort((a, b) => b.value - a.value);
}

function getTimelineColors(
  settings: AppSettingRecord[],
): Record<DayTimelineCell["state"], string> {
  const setting = settings.find((item) => item.key === timelineColorSettingKey);
  if (!setting) {
    return defaultTimelineColors;
  }

  try {
    return normalizeTimelineColors(JSON.parse(setting.value_json));
  } catch {
    return defaultTimelineColors;
  }
}

function normalizeTimelineColors(
  value: unknown,
): Record<DayTimelineCell["state"], string> {
  const source = isRecord(value) ? value : {};

  return {
    empty: normalizeTimelineColorValue(source.empty, defaultTimelineColors.empty),
    startup_delay: normalizeTimelineColorValue(
      source.startup_delay,
      defaultTimelineColors.startup_delay,
    ),
    break: normalizeTimelineColorValue(source.break, defaultTimelineColors.break),
    focus: normalizeTimelineColorValue(source.focus, defaultTimelineColors.focus),
    blocked: normalizeTimelineColorValue(source.blocked, defaultTimelineColors.blocked),
  };
}

function normalizeTimelineColorValue(value: unknown, fallbackColor: string): string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value.trim())
    ? value.trim().toLowerCase()
    : fallbackColor;
}

function getTimelineColorStyle(
  colors: Record<DayTimelineCell["state"], string>,
) {
  return {
    "--timeline-color-empty": colors.empty,
    "--timeline-color-startup-delay": colors.startup_delay,
    "--timeline-color-break": colors.break,
    "--timeline-color-focus": colors.focus,
    "--timeline-color-blocked": colors.blocked,
  } as React.CSSProperties;
}

function getLabelUsageCounts(snapshot: AppSnapshot): Map<Id, number> {
  const counts = new Map<Id, number>();
  const activeReviewIds = new Set(
    snapshot.sessionReviews
      .filter((review) => !review.deleted_at)
      .map((review) => review.id),
  );

  for (const review of snapshot.sessionReviews) {
    if (!review.deleted_at) {
      counts.set(
        review.status_label_id,
        (counts.get(review.status_label_id) ?? 0) + 1,
      );
    }
  }

  for (const relation of snapshot.sessionReviewLabels) {
    if (activeReviewIds.has(relation.review_id)) {
      counts.set(relation.label_id, (counts.get(relation.label_id) ?? 0) + 1);
    }
  }

  return counts;
}

function defaultLabelColor(type: LabelType): string {
  if (type === "session_status") {
    return "#2f855a";
  }

  if (type === "product") {
    return "#3182ce";
  }

  return "#d49a24";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function typeLabel(type: LabelType): string {
  if (type === "session_status") {
    return "状态";
  }
  if (type === "product") {
    return "产物";
  }
  return "不专注原因";
}
