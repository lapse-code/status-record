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
  Play,
  Plus,
  RotateCcw,
  Save,
  Square,
  Tags,
  TimerReset,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildAnalyticsSummary,
  buildDayTimeline,
  getAnalyticsRange,
} from "./domain/analytics";
import { calculateBreakBalance } from "./domain/break-bank";
import {
  activeLabelsByType,
  getNoneBlockerLabel,
  labelNameById,
} from "./domain/labels";
import {
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
  exportAllData,
  importAllData,
  loadSnapshot,
  pauseFocusTimer,
  resumeFocusTimer,
  seedDemoData,
  startFocusTimer,
  submitSessionReview,
  updateLabel,
  upsertSleepLog,
} from "./services/app-service";
import { primeReminderChannel, sendReminder } from "./reminders";
import type {
  AnalyticsGrain,
  AnalyticsSummary,
  AppSnapshot,
  BreakSessionRecord,
  DayTimelineCell,
  FocusSessionRecord,
  Id,
  LabelRecord,
  LabelType,
  SubmitSessionReviewInput,
} from "./types";

type TabId = "today" | "analytics" | "labels";
type DetailFilter = { type: LabelType; id: Id } | null;

const emptySnapshot: AppSnapshot = {
  labels: [],
  arrivalSessions: [],
  focusSessions: [],
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

export default function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot>(emptySnapshot);
  const [activeTab, setActiveTab] = useState<TabId>("today");
  const [customMinutes, setCustomMinutes] = useState(25);
  const [message, setMessage] = useState<string>("");
  const [now, setNow] = useState(() => new Date());
  const [isLoading, setIsLoading] = useState(true);
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
  const breakBalance = useMemo(
    () => calculateBreakBalance(snapshot.breakBankTransactions),
    [snapshot.breakBankTransactions],
  );
  const todaySummary = useMemo(
    () =>
      buildAnalyticsSummary(
        snapshot,
        getAnalyticsRange("day", new Date()),
      ),
    [snapshot],
  );
  const [todayTimelineDate, setTodayTimelineDate] = useState(toLocalDate());
  const todayTimeline = useMemo(
    () => buildDayTimeline(snapshot, todayTimelineDate),
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
      completeBreakTimer(activeBreakSession.id)
        .then(refresh)
        .then(() => {
          sendReminder("break-complete");
          setMessage("休息结束，请选择下一轮番茄钟时间继续。");
        })
        .finally(() => {
          completingBreakRef.current = null;
        });
    }
  }, [activeBreakSession, breakRemainingSeconds, refresh]);

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

  const navigation = [
    { id: "today" as const, label: "今天", icon: Clock },
    { id: "analytics" as const, label: "统计", icon: BarChart3 },
    { id: "labels" as const, label: "标签", icon: Tags },
  ];
  const activeViewCopy =
    activeTab === "today"
      ? { eyebrow: "今日工作台", title: "继续保持专注" }
      : activeTab === "analytics"
        ? { eyebrow: "统计分析", title: "复盘时间和状态" }
        : { eyebrow: "标签管理", title: "整理记录分类" };

  if (isLoading) {
    return <div className="app-shell loading">正在载入本地记录...</div>;
  }

  return (
    <div className="app-shell focus-studio-shell">
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
          <i>完成学习后自动累计</i>
        </div>

        <div className="side-spacer" />

        <div className="side-panel subtle">
          <span>本地数据已就绪</span>
          <i>数据保存在此设备</i>
        </div>

        <div className="side-actions">
          <button className="ghost-button" type="button" onClick={handleSeedDemoData}>
            <Plus size={18} />
            示例数据
          </button>
          <input
            ref={importFileInputRef}
            accept="application/json,.json"
            aria-label="导入 JSON 文件"
            className="visually-hidden"
            type="file"
            onChange={handleImport}
          />
          <button
            className="ghost-button"
            type="button"
            onClick={() => importFileInputRef.current?.click()}
          >
            <Upload size={18} />
            导入
          </button>
          <button className="ghost-button" type="button" onClick={handleExport}>
            <Download size={18} />
            导出
          </button>
        </div>
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
                  <p>到岗记录启动延迟，番茄钟记录真实学习分钟。</p>
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
                    <span>休息倒计时进行中，结束后会自动开始记录下一轮启动延迟。</span>
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
                          }, "已到岗，启动延迟开始记录。")
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
                        ? "已暂停"
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
                        runAction(() => pauseFocusTimer(activeFocusSession.id), "已暂停。")
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
                          "已继续。",
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
                        "已结束本轮，请复盘。",
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
                </div>
                <p>每完成 25 分钟学习获得 5 分钟休息。</p>
              </div>
            </section>

            <aside className="today-side">
              <section className="summary-strip">
                <StatCard
                  label="今日学习"
                  value={formatMinutes(todaySummary.totalFocusMinutes)}
                />
                <StatCard
                  label="今日启动延迟"
                  value={formatMinutes(todaySummary.totalStartupDelayMinutes)}
                />
                <StatCard
                  label="注意力切换"
                  value={`${todaySummary.totalAttentionSwitchCount} 次`}
                />
                <StatCard label="休息余额" value={formatMinutes(breakBalance)} />
              </section>

              <SleepPanel snapshot={snapshot} onSaved={refresh} onMessage={setMessage} />
            </aside>

            <DayTimelinePanel
              cells={todayTimeline}
              date={todayTimelineDate}
              onDateChange={(date) => setTodayTimelineDate(date || toLocalDate())}
              onNextDate={() =>
                setTodayTimelineDate((date) => shiftLocalDate(date, 1))
              }
              onPreviousDate={() =>
                setTodayTimelineDate((date) => shiftLocalDate(date, -1))
              }
              onToday={() => setTodayTimelineDate(toLocalDate())}
            />

            <RecentSessions snapshot={snapshot} />
          </main>
        ) : null}

        {activeTab === "analytics" ? <AnalyticsView snapshot={snapshot} /> : null}

        {activeTab === "labels" ? (
          <LabelsView snapshot={snapshot} onChanged={refresh} onMessage={setMessage} />
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
                : "复盘已保存，已开始记录下一轮启动延迟。",
            );
          }}
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
                  applySleepDuration(sleepDurationMinutes - sleepStepMinutes);
                }
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  applySleepDuration(sleepDurationMinutes + sleepStepMinutes);
                }
                if (event.key === "Enter") {
                  commitSleepDurationInput();
                }
              }}
            />
            <div className="stepper-buttons">
              <button
                aria-label="减少睡眠时长 15 分钟"
                type="button"
                onClick={() => applySleepDuration(sleepDurationMinutes - sleepStepMinutes)}
              >
                <ChevronUp size={16} />
              </button>
              <button
                aria-label="增加睡眠时长 15 分钟"
                type="button"
                onClick={() => applySleepDuration(sleepDurationMinutes + sleepStepMinutes)}
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
                  applyEnergyScore(energyScore - 1);
                }
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  applyEnergyScore(energyScore + 1);
                }
                if (event.key === "Enter") {
                  commitEnergyInput();
                }
              }}
            />
            <span className="stepper-suffix">/ 5</span>
            <div className="stepper-buttons">
              <button
                aria-label="减少精力"
                type="button"
                onClick={() => applyEnergyScore(energyScore - 1)}
              >
                <ChevronUp size={16} />
              </button>
              <button
                aria-label="增加精力"
                type="button"
                onClick={() => applyEnergyScore(energyScore + 1)}
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
  const productLabels = activeLabelsByType(labels, "product");
  const blockerLabels = activeLabelsByType(labels, "blocker");
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
  const [breakMinutesUsed, setBreakMinutesUsed] = useState(
    Math.min(
      breakBalance,
      focusSession.earned_break_minutes > 0 ? focusSession.earned_break_minutes : 5,
    ),
  );
  const [error, setError] = useState("");

  function toggleProduct(labelId: Id) {
    setProductLabelIds((current) =>
      current.includes(labelId)
        ? current.filter((id) => id !== labelId)
        : [...current, labelId],
    );
  }

  function toggleBlocker(label: LabelRecord) {
    setBlockerLabelIds((current) => {
      if (noneBlocker && label.id === noneBlocker.id) {
        return current.includes(label.id) ? [] : [label.id];
      }

      const withoutNone = noneBlocker
        ? current.filter((id) => id !== noneBlocker.id)
        : current;

      return withoutNone.includes(label.id)
        ? withoutNone.filter((id) => id !== label.id)
        : [...withoutNone, label.id];
    });
  }

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

        <fieldset>
          <legend>状态</legend>
          <div className="chip-grid">
            {statusLabels.map((label) => (
              <button
                key={label.id}
                className={statusLabelId === label.id ? "chip selected" : "chip"}
                style={{ "--chip-color": label.color } as React.CSSProperties}
                type="button"
                onClick={() => setStatusLabelId(label.id)}
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
            value={attentionSwitchCount}
            onChange={(event) =>
              setAttentionSwitchCount(Number(event.currentTarget.value))
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
                  productLabelIds.includes(label.id) ? "chip selected" : "chip"
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
            value={productNote}
            placeholder="这轮实际产出了什么？"
            onChange={(event) => setProductNote(event.currentTarget.value)}
          />
        </fieldset>

        <fieldset>
          <legend>主要阻塞</legend>
          <div className="chip-grid">
            {blockerLabels.map((label) => (
              <button
                key={label.id}
                className={
                  blockerLabelIds.includes(label.id) ? "chip selected" : "chip"
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
            value={blockerNote}
            placeholder="可选：补充说明阻塞原因"
            onChange={(event) => setBlockerNote(event.currentTarget.value)}
          />
        </fieldset>

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
                disabled={breakBalance <= 0}
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
              max={breakBalance}
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

function AnalyticsView({ snapshot }: { snapshot: AppSnapshot }) {
  const [grain, setGrain] = useState<AnalyticsGrain>("week");
  const [detailFilter, setDetailFilter] = useState<DetailFilter>(null);
  const [selectedTimelineDate, setSelectedTimelineDate] = useState<string | null>(
    null,
  );
  const summary = useMemo<AnalyticsSummary>(
    () => buildAnalyticsSummary(snapshot, getAnalyticsRange(grain, new Date())),
    [grain, snapshot],
  );
  const suggestedTimelineDate = useMemo(
    () => getTimelineDate(summary.range, snapshot),
    [snapshot, summary.range],
  );
  const timelineDate = isLocalDateString(selectedTimelineDate)
    ? selectedTimelineDate
    : suggestedTimelineDate;
  const dayTimeline = useMemo(
    () => buildDayTimeline(snapshot, timelineDate),
    [snapshot, timelineDate],
  );
  const statusData = buildCountData(summary.statusCounts, snapshot.labels);
  const productData = buildCountData(summary.productLabelCounts, snapshot.labels);
  const blockerData = buildCountData(summary.blockerLabelCounts, snapshot.labels);
  const selectedDetailLabel = detailFilter
    ? getDistributionData(detailFilter.type, statusData, productData, blockerData).find(
        (item) => item.id === detailFilter.id,
      )
    : undefined;
  const filteredReviewEntries = detailFilter
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
    if (
      detailFilter &&
      !getDistributionData(detailFilter.type, statusData, productData, blockerData).some(
        (item) => item.id === detailFilter.id,
      )
    ) {
      setDetailFilter(null);
    }
  }, [blockerData, detailFilter, productData, statusData]);

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
          <div className="segmented-control">
            {(["day", "week", "month"] as AnalyticsGrain[]).map((item) => (
              <button
                key={item}
                className={grain === item ? "selected" : ""}
                type="button"
                onClick={() => setGrain(item)}
              >
                {item === "day" ? "日" : item === "week" ? "周" : "月"}
              </button>
            ))}
          </div>
        </div>

        <div className="summary-strip">
          <StatCard label="学习时长" value={formatMinutes(summary.totalFocusMinutes)} />
          <StatCard
            label="启动延迟"
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

      <DayTimelinePanel
        cells={dayTimeline}
        date={timelineDate}
        onDateChange={(date) => setSelectedTimelineDate(date)}
        onNextDate={() =>
          setSelectedTimelineDate((date) => shiftLocalDate(date || timelineDate, 1))
        }
        onPreviousDate={() =>
          setSelectedTimelineDate((date) => shiftLocalDate(date || timelineDate, -1))
        }
        onToday={() => setSelectedTimelineDate(toLocalDate())}
      />

      <section className="panel chart-panel">
        <h3>学习与启动延迟</h3>
        <ResponsiveContainer height={260} width="100%">
          <BarChart data={summary.trend}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis />
            <Tooltip />
            <Bar dataKey="focusMinutes" fill="#2f855a" name="学习分钟" />
            <Bar dataKey="startupDelayMinutes" fill="#b7791f" name="启动延迟" />
          </BarChart>
        </ResponsiveContainer>
      </section>

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

      <DistributionPanel
        title="状态分布"
        data={statusData}
        selectedId={detailFilter?.type === "session_status" ? detailFilter.id : null}
        onSelect={(id) => toggleDetailFilter("session_status", id)}
      />
      <DistributionPanel
        title="产物标签"
        data={productData}
        selectedId={detailFilter?.type === "product" ? detailFilter.id : null}
        onSelect={(id) => toggleDetailFilter("product", id)}
      />
      <DistributionPanel
        title="阻塞原因"
        data={blockerData}
        selectedId={detailFilter?.type === "blocker" ? detailFilter.id : null}
        onSelect={(id) => toggleDetailFilter("blocker", id)}
      />

      <section className="panel notes-panel">
        <div className="notes-panel-heading">
          <div>
            <h3>记录明细</h3>
            <p>
              {selectedDetailLabel
                ? `当前只看「${selectedDetailLabel.name}」相关记录`
                : "点击上方状态、产物或阻塞图表，可筛选这里的复盘记录。"}
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
                <div className="record-meta">
                  <span>{entry.local_date}</span>
                  <strong>{entry.statusLabelName}</strong>
                  <em>{formatMinutes(entry.focusMinutes)}</em>
                  <em>{entry.attentionSwitchCount} 次切换</em>
                </div>
                <div className="record-tags">
                  <span>产物：{entry.productLabelNames.join("、") || "未标记"}</span>
                  <span>阻塞：{entry.blockerLabelNames.join("、") || "未标记"}</span>
                </div>
                {entry.productNote ? <p>产物记录：{entry.productNote}</p> : null}
                {entry.blockerNote ? <p>阻塞记录：{entry.blockerNote}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-text">
            {selectedDetailLabel
              ? `这个时间范围内没有「${selectedDetailLabel.name}」相关复盘记录。`
              : "这个时间范围内还没有复盘记录。"}
          </p>
        )}
      </section>
    </main>
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
  onDateChange,
  onNextDate,
  onPreviousDate,
  onToday,
}: {
  cells: DayTimelineCell[];
  date: string;
  onDateChange: (date: string | null) => void;
  onNextDate: () => void;
  onPreviousDate: () => void;
  onToday: () => void;
}) {
  const [panelRef, panelWidth] = useElementWidth<HTMLElement>();
  const slotsPerColumn = panelWidth >= 820 ? 6 : 12;
  const mode = slotsPerColumn === 6 ? "half-hour" : "hour";
  const columns = Array.from(
    { length: Math.ceil(cells.length / slotsPerColumn) },
    (_, columnIndex) =>
      cells.slice(
        columnIndex * slotsPerColumn,
        columnIndex * slotsPerColumn + slotsPerColumn,
      ),
  );
  const counts = cells.reduce(
    (result, cell) => {
      result[cell.state] += 1;
      return result;
    },
    { empty: 0, startup_delay: 0, focus: 0, blocked: 0 },
  );

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
            {date} · 每点 5 分钟 · 每列
            {mode === "half-hour" ? " 30 分钟" : " 1 小时"}
          </p>
        </div>
        <div className="timeline-actions">
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
          <div className="dot-legend" aria-label="日点阵图例">
            <span>
              <i className="day-dot startup_delay" />
              延迟 {counts.startup_delay}
            </span>
            <span>
              <i className="day-dot focus" />
              学习 {counts.focus}
            </span>
            <span>
              <i className="day-dot blocked" />
              阻塞 {counts.blocked}
            </span>
          </div>
        </div>
      </div>
      <div className="day-dot-scroll">
        <div className="day-dot-grid" aria-label={`${date} 日点阵`}>
          {columns.map((column, columnIndex) => (
            <div className="day-dot-column" key={`${date}-${columnIndex}`}>
              {column.map((cell) => (
                <span
                  key={cell.id}
                  aria-label={`${cell.timeLabel} ${timelineCellLabel(cell.state)}`}
                  className={`day-dot ${cell.state}`}
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
    </section>
  );
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
    return "启动延迟";
  }

  if (state === "blocked") {
    return "阻塞或被打断";
  }

  if (state === "focus") {
    return "正常学习";
  }

  return "空白";
}

function DistributionPanel({
  title,
  data,
  selectedId,
  onSelect,
}: {
  title: string;
  data: { id: Id; name: string; value: number; color?: string }[];
  selectedId?: Id | null;
  onSelect?: (id: Id) => void;
}) {
  return (
    <section className="panel chart-panel">
      <h3>{title}</h3>
      {data.length > 0 ? (
        <div className="distribution-grid">
          <ResponsiveContainer height={220} width="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                outerRadius={78}
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
        <p className="empty-text">暂无数据。</p>
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
      {item.name}
      <strong>{item.value}</strong>
    </>
  );
}

function LabelsView({
  snapshot,
  onChanged,
  onMessage,
}: {
  snapshot: AppSnapshot;
  onChanged: () => Promise<void>;
  onMessage: (message: string) => void;
}) {
  const [labelType, setLabelType] = useState<LabelType>("product");
  const [labelName, setLabelName] = useState("");

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    try {
      await createLabel(labelType, labelName);
      setLabelName("");
      await onChanged();
      onMessage("标签已新增。");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "新增标签失败。");
    }
  }

  return (
    <main className="labels-layout">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>标签管理</h2>
            <p>状态、产物、阻塞都可以扩展；隐藏标签不会影响历史统计。</p>
          </div>
          <Tags size={22} />
        </div>

        <form className="label-create-form" onSubmit={handleCreate}>
          <label>
            类型
            <select
              value={labelType}
              onChange={(event) => setLabelType(event.currentTarget.value as LabelType)}
            >
              <option value="session_status">状态</option>
              <option value="product">产物</option>
              <option value="blocker">阻塞</option>
            </select>
          </label>
          <label>
            名称
            <input
              value={labelName}
              onChange={(event) => setLabelName(event.currentTarget.value)}
              placeholder="新增标签"
            />
          </label>
          <button className="primary-button" type="submit">
            <Plus size={18} />
            新增
          </button>
        </form>
      </section>

      {(["session_status", "product", "blocker"] as LabelType[]).map((type) => (
        <section className="panel" key={type}>
          <h3>{typeLabel(type)}</h3>
          <div className="label-list">
            {snapshot.labels
              .filter((label) => label.type === type && !label.deleted_at)
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((label) => (
                <LabelRow
                  key={label.id}
                  label={label}
                  onChanged={onChanged}
                  onMessage={onMessage}
                />
              ))}
          </div>
        </section>
      ))}
    </main>
  );
}

function LabelRow({
  label,
  onChanged,
  onMessage,
}: {
  label: LabelRecord;
  onChanged: () => Promise<void>;
  onMessage: (message: string) => void;
}) {
  const [name, setName] = useState(label.name);

  useEffect(() => {
    setName(label.name);
  }, [label.name]);

  return (
    <div className={label.is_active ? "label-row" : "label-row inactive"}>
      <span className="label-color" style={{ backgroundColor: label.color }} />
      <input value={name} onChange={(event) => setName(event.currentTarget.value)} />
      <button
        className="secondary-button"
        type="button"
        onClick={async () => {
          try {
            await updateLabel({ labelId: label.id, name });
            await onChanged();
            onMessage("标签已保存。");
          } catch (error) {
            onMessage(error instanceof Error ? error.message : "保存失败。");
          }
        }}
      >
        <Save size={16} />
        保存
      </button>
      <button
        className="ghost-button"
        type="button"
        onClick={async () => {
          await updateLabel({ labelId: label.id, isActive: !label.is_active });
          await onChanged();
        }}
      >
        {label.is_active ? "隐藏" : "启用"}
      </button>
    </div>
  );
}

function RecentSessions({ snapshot }: { snapshot: AppSnapshot }) {
  const [filter, setFilter] = useState<DetailFilter>(null);
  const labelsById = new Map(snapshot.labels.map((label) => [label.id, label]));
  const reviewsByFocusId = new Map(
    snapshot.sessionReviews
      .filter((review) => !review.deleted_at)
      .map((review) => [review.focus_session_id, review]),
  );
  const reviewLabelsByReviewId = new Map<Id, AppSnapshot["sessionReviewLabels"]>();
  snapshot.sessionReviewLabels.forEach((relation) => {
    const relations = reviewLabelsByReviewId.get(relation.review_id) ?? [];
    relations.push(relation);
    reviewLabelsByReviewId.set(relation.review_id, relations);
  });
  const entries = snapshot.focusSessions
    .filter((session) => session.state === "reviewed")
    .sort(
      (a, b) =>
        new Date(b.completed_at ?? b.started_at).getTime() -
        new Date(a.completed_at ?? a.started_at).getTime(),
    )
    .map((session) => {
      const review = reviewsByFocusId.get(session.id);
      const reviewLabels = review ? reviewLabelsByReviewId.get(review.id) ?? [] : [];
      const productLabelIds = reviewLabels
        .filter((relation) => relation.label_type === "product")
        .map((relation) => relation.label_id);
      const blockerLabelIds = reviewLabels
        .filter((relation) => relation.label_type === "blocker")
        .map((relation) => relation.label_id);

      return {
        session,
        review,
        statusLabelId: review?.status_label_id,
        statusLabelName: review
          ? labelNameById(snapshot.labels, review.status_label_id)
          : "未复盘",
        productLabelIds,
        productLabelNames: productLabelIds.map((id) => labelsById.get(id)?.name).filter(Boolean),
        blockerLabelIds,
        blockerLabelNames: blockerLabelIds.map((id) => labelsById.get(id)?.name).filter(Boolean),
      };
    });
  const filterOptions = buildRecentFilterOptions(entries, labelsById).slice(0, 8);
  const filteredEntries = filter
    ? entries.filter((entry) => {
        if (filter.type === "session_status") {
          return entry.statusLabelId === filter.id;
        }

        if (filter.type === "product") {
          return entry.productLabelIds.includes(filter.id);
        }

        return entry.blockerLabelIds.includes(filter.id);
      })
    : entries;
  const recent = filteredEntries.slice(0, 5);

  return (
    <section className="panel recent-panel">
      <div className="panel-heading">
        <div>
          <h2>最近记录</h2>
          <p>最近完成复盘的专注轮次。</p>
        </div>
        <RotateCcw size={22} />
      </div>
      {entries.length > 0 ? (
        <div className="recent-filter-bar" aria-label="最近记录筛选">
          <button
            className={!filter ? "filter-chip selected" : "filter-chip"}
            type="button"
            onClick={() => setFilter(null)}
          >
            全部
          </button>
          {filterOptions.map((option) => (
            <button
              key={`${option.type}-${option.id}`}
              className={
                filter?.type === option.type && filter.id === option.id
                  ? "filter-chip selected"
                  : "filter-chip"
              }
              type="button"
              onClick={() =>
                setFilter((current) =>
                  current?.type === option.type && current.id === option.id
                    ? null
                    : { type: option.type, id: option.id },
                )
              }
            >
              {option.name} {option.count}
            </button>
          ))}
        </div>
      ) : null}
      {recent.length > 0 ? (
        <ul className="recent-list">
          {recent.map((entry) => {
            const { review, session } = entry;
            return (
              <li key={session.id}>
                <span>{session.local_date}</span>
                <strong>{formatMinutes(session.actual_duration_minutes ?? 0)}</strong>
                <em>{entry.statusLabelName}</em>
                <p>{review?.product_note || "没有产物文字"}</p>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="empty-text">
          {entries.length > 0 ? "当前筛选下没有记录。" : "完成第一轮复盘后，这里会显示记录。"}
        </p>
      )}
    </section>
  );
}

function buildRecentFilterOptions(
  entries: {
    statusLabelId?: Id;
    productLabelIds: Id[];
    blockerLabelIds: Id[];
  }[],
  labelsById: Map<Id, LabelRecord>,
) {
  const options = new Map<
    string,
    { type: LabelType; id: Id; name: string; count: number }
  >();

  entries.forEach((entry) => {
    if (entry.statusLabelId) {
      incrementRecentFilterOption(options, labelsById, "session_status", entry.statusLabelId);
    }
    entry.productLabelIds.forEach((id) =>
      incrementRecentFilterOption(options, labelsById, "product", id),
    );
    entry.blockerLabelIds.forEach((id) =>
      incrementRecentFilterOption(options, labelsById, "blocker", id),
    );
  });

  return Array.from(options.values()).sort((a, b) => b.count - a.count);
}

function incrementRecentFilterOption(
  options: Map<string, { type: LabelType; id: Id; name: string; count: number }>,
  labelsById: Map<Id, LabelRecord>,
  type: LabelType,
  id: Id,
) {
  const label = labelsById.get(id);
  if (!label) {
    return;
  }

  const key = `${type}-${id}`;
  const existing = options.get(key);
  if (existing) {
    existing.count += 1;
    return;
  }

  options.set(key, { type, id, name: label.name, count: 1 });
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
        new Date(b.arrived_at).getTime() - new Date(a.arrived_at).getTime(),
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

function getTimelineDate(
  range: AnalyticsSummary["range"],
  snapshot: AppSnapshot,
): string {
  if (range.grain === "day") {
    return range.startDate;
  }

  const dates = [
    ...snapshot.focusSessions.map((session) => session.local_date),
    ...snapshot.arrivalSessions.map((arrival) => arrival.local_date),
  ]
    .filter((date) => date >= range.startDate && date <= range.endDate)
    .sort((a, b) => b.localeCompare(a));

  return dates[0] ?? range.endDate;
}

function shiftLocalDate(date: string, dayDelta: number): string {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + dayDelta);
  return toLocalDate(value);
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

function typeLabel(type: LabelType): string {
  if (type === "session_status") {
    return "状态";
  }
  if (type === "product") {
    return "产物";
  }
  return "阻塞";
}
