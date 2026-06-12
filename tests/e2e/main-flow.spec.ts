import { expect, test } from "@playwright/test";

const backupFixture = {
  format: "status-record.backup",
  formatVersion: 1,
  appVersion: "0.1.0",
  exportedAt: "2026-06-11T00:00:00.000Z",
  tables: {
    labels: [],
    arrival_sessions: [
      {
        id: "import-arrival-1",
        local_date: "2026-06-11",
        arrived_at: "2026-06-11T00:00:00.000Z",
        left_at: "2026-06-11T01:00:00.000Z",
        created_at: "2026-06-11T00:00:00.000Z",
        updated_at: "2026-06-11T01:00:00.000Z",
      },
    ],
    focus_sessions: [
      {
        id: "import-focus-1",
        arrival_session_id: "import-arrival-1",
        local_date: "2026-06-11",
        planned_duration_minutes: 25,
        actual_duration_minutes: 25,
        started_at: "2026-06-11T00:15:00.000Z",
        paused_total_seconds: 0,
        completed_at: "2026-06-11T00:40:00.000Z",
        state: "reviewed",
        earned_break_minutes: 5,
        created_at: "2026-06-11T00:15:00.000Z",
        updated_at: "2026-06-11T00:40:00.000Z",
      },
    ],
    session_reviews: [
      {
        id: "import-review-1",
        focus_session_id: "import-focus-1",
        status_label_id: "status-completed",
        attention_switch_count: 1,
        product_note: "导入备份里的可见产物记录",
        created_at: "2026-06-11T00:41:00.000Z",
        updated_at: "2026-06-11T00:41:00.000Z",
      },
    ],
    session_review_labels: [
      {
        id: "import-review-label-1",
        review_id: "import-review-1",
        label_id: "product-note",
        label_type: "product",
        created_at: "2026-06-11T00:41:00.000Z",
      },
      {
        id: "import-review-label-2",
        review_id: "import-review-1",
        label_id: "blocker-none",
        label_type: "blocker",
        created_at: "2026-06-11T00:41:00.000Z",
      },
    ],
    break_bank_transactions: [
      {
        id: "import-break-earned-1",
        focus_session_id: "import-focus-1",
        local_date: "2026-06-11",
        type: "earned",
        minutes: 5,
        note: "导入测试",
        created_at: "2026-06-11T00:40:00.000Z",
      },
    ],
    break_sessions: [],
    sleep_logs: [
      {
        id: "import-sleep-1",
        local_date: "2026-06-11",
        sleep_duration_minutes: 450,
        energy_score: 4,
        created_at: "2026-06-11T00:00:00.000Z",
        updated_at: "2026-06-11T00:00:00.000Z",
      },
    ],
    app_settings: [],
  },
};

const pendingReviewBreakFixture = {
  format: "status-record.backup",
  formatVersion: 1,
  appVersion: "0.1.0",
  exportedAt: "2026-06-11T00:00:00.000Z",
  tables: {
    labels: [],
    arrival_sessions: [
      {
        id: "break-arrival-1",
        local_date: "2026-06-11",
        arrived_at: "2026-06-11T00:00:00.000Z",
        left_at: "2026-06-11T00:30:00.000Z",
        created_at: "2026-06-11T00:00:00.000Z",
        updated_at: "2026-06-11T00:30:00.000Z",
      },
    ],
    focus_sessions: [
      {
        id: "break-focus-1",
        arrival_session_id: "break-arrival-1",
        local_date: "2026-06-11",
        planned_duration_minutes: 25,
        actual_duration_minutes: 25,
        started_at: "2026-06-11T00:00:00.000Z",
        paused_total_seconds: 0,
        completed_at: "2026-06-11T00:25:00.000Z",
        state: "completed",
        earned_break_minutes: 5,
        created_at: "2026-06-11T00:00:00.000Z",
        updated_at: "2026-06-11T00:25:00.000Z",
      },
    ],
    session_reviews: [],
    session_review_labels: [],
    break_bank_transactions: [
      {
        id: "break-earned-1",
        focus_session_id: "break-focus-1",
        local_date: "2026-06-11",
        type: "earned",
        minutes: 5,
        note: "完整完成测试",
        created_at: "2026-06-11T00:25:00.000Z",
      },
    ],
    break_sessions: [],
    sleep_logs: [],
    app_settings: [],
  },
};

const expiredBreakWithBalanceFixture = {
  format: "status-record.backup",
  formatVersion: 1,
  appVersion: "0.1.0",
  exportedAt: "2026-06-11T00:00:00.000Z",
  tables: {
    labels: [],
    arrival_sessions: [],
    focus_sessions: [],
    session_reviews: [],
    session_review_labels: [],
    break_bank_transactions: [
      {
        id: "extend-break-earned",
        local_date: "2026-06-11",
        type: "earned",
        minutes: 20,
        note: "延长休息测试余额",
        created_at: "2026-06-11T00:00:00.000Z",
      },
      {
        id: "extend-break-used",
        local_date: "2026-06-11",
        type: "used",
        minutes: -5,
        note: "正在进行的休息已扣除",
        created_at: "2026-06-11T00:05:00.000Z",
      },
    ],
    break_sessions: [
      {
        id: "extend-break-running",
        local_date: "2026-06-11",
        planned_duration_minutes: 5,
        started_at: "2026-06-11T00:05:00.000Z",
        state: "running",
        created_at: "2026-06-11T00:05:00.000Z",
        updated_at: "2026-06-11T00:05:00.000Z",
      },
    ],
    sleep_logs: [],
    app_settings: [],
  },
};

test("records a completed focus session review", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "到岗" }).click();
  await expect(page.getByText("已到岗", { exact: true })).toBeVisible();

  await page.getByLabel("自定义分钟").fill("1");
  await page.getByRole("button", { name: /^开始$/ }).click();
  await expect(page.getByText("专注中")).toBeVisible();

  await page.getByRole("button", { name: "完成" }).click();
  await expect(page.getByRole("heading", { name: "本轮复盘" })).toBeVisible();

  await page.getByLabel("注意力切换次数").fill("2");
  await page.getByRole("button", { name: "笔记" }).click();
  await page.getByPlaceholder("这轮实际产出了什么？").fill("完成了第一条测试记录");
  await page.getByRole("button", { name: "保存复盘" }).click();

  await expect(page.getByText("复盘已保存，已开始记录下一轮启动延迟。")).toBeVisible();
  await expect(page.getByText("今日学习")).toBeVisible();
});

test("auto checks in when starting focus without an open arrival", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("自定义分钟").fill("1");
  await page.getByRole("button", { name: /^开始$/ }).click();

  await expect(page.getByText("已自动到岗并开始 1 分钟专注。")).toBeVisible();
  await expect(page.getByText("专注中")).toBeVisible();

  await page.getByRole("button", { name: "完成" }).click();
  await expect(page.getByRole("heading", { name: "本轮复盘" })).toBeVisible();
  await page.getByRole("button", { name: "保存复盘" }).click();

  await expect(page.getByText("复盘已保存，已开始记录下一轮启动延迟。")).toBeVisible();
  await expect(page.getByText("今日启动延迟")).toBeVisible();
  await expect(page.locator(".stat-card").filter({ hasText: "今日启动延迟" }).getByText("0 分钟")).toBeVisible();
});

test("does not earn break balance for early manual completion", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "到岗" }).click();
  await page.getByRole("button", { name: "25 分钟" }).click();
  await page.getByRole("button", { name: "完成" }).click();

  await expect(
    page.getByText("本轮 0 分钟，获得 0 分钟休息。"),
  ).toBeVisible();
  await expect(page.getByRole("radio", { name: "使用休息" })).toBeDisabled();
});

test("starts and ends a break timer after review", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("导入 JSON 文件").setInputFiles({
    name: "status-record-break-review.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(pendingReviewBreakFixture)),
  });
  await expect(page.getByRole("heading", { name: "本轮复盘" })).toBeVisible();
  await expect(
    page.getByText("本轮 25 分钟，获得 5 分钟休息。"),
  ).toBeVisible();

  await page.getByRole("radio", { name: "使用休息" }).check();
  await expect(page.getByLabel("休息倒计时分钟数")).toHaveValue("5");
  await page.getByRole("button", { name: "保存复盘" }).click();

  await expect(page.getByText("复盘已保存，休息倒计时已开始。")).toBeVisible();
  await expect(page.locator(".timer-caption")).toHaveText("休息中");
  await expect(page.getByRole("button", { name: "提前结束休息" })).toBeVisible();

  await page.getByRole("button", { name: "提前结束休息" }).click();
  await expect(page.getByText("已提前结束休息")).toBeVisible();
  await expect(page.getByText("已到岗", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "25 分钟" })).toBeEnabled();
});

test("prompts to extend break when rest balance remains", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("导入 JSON 文件").setInputFiles({
    name: "status-record-expired-break.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(expiredBreakWithBalanceFixture)),
  });

  await expect(page.getByRole("heading", { name: "休息结束" })).toBeVisible();
  await expect(page.getByText(/当前还有 15 分钟\s*可用休息。/)).toBeVisible();
  await expect(page.getByRole("button", { name: "继续休息 5 分钟" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "使用全部 15 分钟" })).toBeVisible();
  await expect(page.getByLabel("自定义休息分钟")).toHaveValue("5");

  await page.getByRole("button", { name: "继续休息 5 分钟" }).click();
  await expect(page.getByText("已继续休息 5 分钟。")).toBeVisible();
  await expect(page.locator(".timer-caption")).toHaveText("休息中");
});

test("restores a running focus timer after reload", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("自定义分钟").fill("1");
  await page.getByRole("button", { name: "开始" }).click();
  await expect(page.getByText("专注中")).toBeVisible();

  await page.reload();
  await expect(page.getByText("专注中")).toBeVisible();
  await expect(page.getByRole("button", { name: "暂停" })).toBeVisible();
});

test("upserts a sleep log for the selected date", async ({ page }) => {
  await page.goto("/");

  const sleepDurationInput = page.getByRole("textbox", { name: "睡眠时长" });
  const energyInput = page.getByRole("textbox", { name: "精力" });

  await expect(sleepDurationInput).toHaveValue("7:00");
  await page.getByRole("button", { name: "增加睡眠时长 15 分钟" }).click();
  await expect(sleepDurationInput).toHaveValue("7:15");
  await page.getByRole("button", { name: "减少睡眠时长 15 分钟" }).click();
  await expect(sleepDurationInput).toHaveValue("7:00");

  await sleepDurationInput.fill("7:30");
  await page.getByRole("button", { name: "增加精力" }).click();
  await expect(energyInput).toHaveValue("4");
  await page.getByRole("button", { name: "保存睡眠" }).click();
  await expect(page.getByText("睡眠记录已保存。")).toBeVisible();

  await sleepDurationInput.fill("8");
  await page.getByRole("button", { name: "减少精力" }).click();
  await expect(energyInput).toHaveValue("3");
  await page.getByRole("button", { name: "保存睡眠" }).click();
  await expect(sleepDurationInput).toHaveValue("8:00");
});

test("creates and hides a custom label", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "标签" }).click();
  await page.getByLabel("类型").selectOption("product");
  await page.getByLabel("名称").fill("草稿");
  await page.getByRole("button", { name: "新增" }).click();

  const labelRow = page
    .locator(".label-row")
    .filter({ has: page.locator('input[value="草稿"]') });
  await expect(labelRow).toBeVisible();
  await labelRow.getByRole("button", { name: "隐藏" }).click();
  await expect(labelRow.getByRole("button", { name: "启用" })).toBeVisible();
});

test("loads demo data into analytics", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "示例数据" }).click();
  await expect(page.getByText("已加载 10 天示例数据")).toBeVisible();

  await page.getByRole("button", { name: "统计" }).click();
  await page.getByRole("button", { name: "月" }).click();

  await expect(page.getByText("13 小时 45 分钟")).toBeVisible();
  await expect(page.getByText("完成统计页面图表")).toBeVisible();
  await expect(page.getByRole("heading", { name: "记录明细" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "日点阵" })).toBeVisible();
  await expect(
    page.getByText(/2026-06-10 · 每点 5 分钟 · 每列 (30 分钟|1 小时)/),
  ).toBeVisible();
  await expect(page.getByText("学习 19")).toBeVisible();
  await page.getByRole("button", { name: "前一天" }).click();
  await expect(
    page.getByText(/2026-06-09 · 每点 5 分钟 · 每列 (30 分钟|1 小时)/),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "点阵日期" }).fill("2026-06-03");
  await expect(
    page.getByText(/2026-06-03 · 每点 5 分钟 · 每列 (30 分钟|1 小时)/),
  ).toBeVisible();
  await page.getByRole("button", { name: "后一天" }).click();
  await expect(
    page.getByText(/2026-06-04 · 每点 5 分钟 · 每列 (30 分钟|1 小时)/),
  ).toBeVisible();

  const productPanel = page.locator(".chart-panel").filter({ hasText: "产物标签" });
  await productPanel.getByRole("button", { name: "文件 4" }).click();
  await expect(page.getByText("当前只看「文件」相关记录")).toBeVisible();
  await expect(page.getByText("整理发布前检查清单。")).toBeVisible();
  await expect(page.getByText("完成统计页面图表。")).not.toBeVisible();

  await productPanel.locator(".recharts-pie-sector path").first().click();
  await expect(page.getByText("当前只看「代码」相关记录")).toBeVisible();
  await expect(page.getByText("完成统计页面图表。")).toBeVisible();

  const statusPanel = page.locator(".chart-panel").filter({ hasText: "状态分布" });
  await statusPanel.getByRole("button", { name: "被打断 2" }).click();
  await expect(page.getByText("当前只看「被打断」相关记录")).toBeVisible();
  await expect(page.getByText("写复盘弹窗时被会议打断。")).toBeVisible();
  await expect(page.getByText("完成统计页面图表。")).not.toBeVisible();

  const blockerPanel = page.locator(".chart-panel").filter({ hasText: "阻塞原因" });
  await blockerPanel.getByRole("button", { name: "太累 2" }).click();
  await expect(page.getByText("当前只看「太累」相关记录")).toBeVisible();
  await expect(page.getByText("睡眠不足，写文档时注意力维持不住。")).toBeVisible();
  await expect(page.getByText("完成统计页面图表。")).not.toBeVisible();
});

test("imports a JSON backup into local records", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("导入 JSON 文件").setInputFiles({
    name: "status-record-import.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backupFixture)),
  });

  await expect(page.getByText("已导入 7 条记录。")).toBeVisible();
  await page.getByRole("button", { name: "统计" }).click();
  await page.getByRole("button", { name: "月" }).click();

  await expect(
    page.locator(".stat-card").filter({ hasText: "学习时长" }).getByText("25 分钟"),
  ).toBeVisible();
  await expect(page.getByText("导入备份里的可见产物记录")).toBeVisible();
});
