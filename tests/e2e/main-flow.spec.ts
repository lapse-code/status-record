import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-06-12T12:00:00+09:00"));
});

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
        local_date: "2026-06-12",
        arrived_at: "2026-06-12T00:00:00.000Z",
        left_at: "2026-06-12T00:30:00.000Z",
        created_at: "2026-06-12T00:00:00.000Z",
        updated_at: "2026-06-12T00:30:00.000Z",
      },
    ],
    focus_sessions: [
      {
        id: "break-focus-1",
        arrival_session_id: "break-arrival-1",
        local_date: "2026-06-12",
        planned_duration_minutes: 25,
        actual_duration_minutes: 25,
        started_at: "2026-06-12T00:00:00.000Z",
        paused_total_seconds: 0,
        completed_at: "2026-06-12T00:25:00.000Z",
        state: "completed",
        earned_break_minutes: 5,
        created_at: "2026-06-12T00:00:00.000Z",
        updated_at: "2026-06-12T00:25:00.000Z",
      },
    ],
    session_reviews: [],
    session_review_labels: [],
    break_bank_transactions: [
      {
        id: "break-earned-1",
        focus_session_id: "break-focus-1",
        local_date: "2026-06-12",
        type: "earned",
        minutes: 5,
        note: "完整完成测试",
        created_at: "2026-06-12T00:25:00.000Z",
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
        local_date: "2026-06-12",
        type: "earned",
        minutes: 20,
        note: "延长休息测试余额",
        created_at: "2026-06-12T00:00:00.000Z",
      },
      {
        id: "extend-break-used",
        local_date: "2026-06-12",
        type: "used",
        minutes: -5,
        note: "正在进行的休息已扣除",
        created_at: "2026-06-12T00:05:00.000Z",
      },
    ],
    break_sessions: [
      {
        id: "extend-break-running",
        local_date: "2026-06-12",
        planned_duration_minutes: 5,
        started_at: "2026-06-12T00:05:00.000Z",
        state: "running",
        created_at: "2026-06-12T00:05:00.000Z",
        updated_at: "2026-06-12T00:05:00.000Z",
      },
    ],
    sleep_logs: [],
    app_settings: [],
  },
};

const cumulativeBreakPendingReviewFixture = {
  format: "status-record.backup",
  formatVersion: 1,
  appVersion: "0.1.0",
  exportedAt: "2026-06-12T00:00:00.000Z",
  tables: {
    labels: [],
    arrival_sessions: [
      {
        id: "cumulative-arrival-1",
        local_date: "2026-06-12",
        arrived_at: "2026-06-12T00:00:00.000Z",
        left_at: "2026-06-12T00:40:00.000Z",
        created_at: "2026-06-12T00:00:00.000Z",
        updated_at: "2026-06-12T00:40:00.000Z",
      },
    ],
    focus_sessions: [
      {
        id: "cumulative-focus-reviewed",
        arrival_session_id: "cumulative-arrival-1",
        local_date: "2026-06-12",
        planned_duration_minutes: 15,
        actual_duration_minutes: 15,
        started_at: "2026-06-12T00:00:00.000Z",
        paused_total_seconds: 0,
        completed_at: "2026-06-12T00:15:00.000Z",
        state: "reviewed",
        earned_break_minutes: 0,
        created_at: "2026-06-12T00:00:00.000Z",
        updated_at: "2026-06-12T00:16:00.000Z",
      },
      {
        id: "cumulative-focus-pending",
        arrival_session_id: "cumulative-arrival-1",
        local_date: "2026-06-12",
        planned_duration_minutes: 15,
        actual_duration_minutes: 15,
        started_at: "2026-06-12T00:20:00.000Z",
        paused_total_seconds: 0,
        completed_at: "2026-06-12T00:35:00.000Z",
        state: "completed",
        earned_break_minutes: 5,
        created_at: "2026-06-12T00:20:00.000Z",
        updated_at: "2026-06-12T00:35:00.000Z",
      },
    ],
    focus_segments: [
      {
        id: "cumulative-segment-reviewed",
        focus_session_id: "cumulative-focus-reviewed",
        local_date: "2026-06-12",
        started_at: "2026-06-12T00:00:00.000Z",
        ended_at: "2026-06-12T00:15:00.000Z",
        state: "completed",
        created_at: "2026-06-12T00:00:00.000Z",
        updated_at: "2026-06-12T00:15:00.000Z",
      },
      {
        id: "cumulative-segment-pending",
        focus_session_id: "cumulative-focus-pending",
        local_date: "2026-06-12",
        started_at: "2026-06-12T00:20:00.000Z",
        ended_at: "2026-06-12T00:35:00.000Z",
        state: "completed",
        created_at: "2026-06-12T00:20:00.000Z",
        updated_at: "2026-06-12T00:35:00.000Z",
      },
    ],
    session_reviews: [],
    session_review_labels: [],
    break_bank_transactions: [],
    break_sessions: [],
    sleep_logs: [],
    app_settings: [],
  },
};

const duplicateOpenArrivalFixture = {
  format: "status-record.backup",
  formatVersion: 1,
  appVersion: "0.1.0",
  exportedAt: "2026-06-11T00:00:00.000Z",
  tables: {
    labels: [],
    arrival_sessions: [
      {
        id: "arrival-open-first",
        local_date: "2026-06-11",
        arrived_at: "2026-06-11T00:00:00.000Z",
        created_at: "2026-06-11T00:00:00.000Z",
        updated_at: "2026-06-11T00:00:00.000Z",
      },
      {
        id: "arrival-open-duplicate",
        local_date: "2026-06-11",
        arrived_at: "2026-06-11T00:30:00.000Z",
        created_at: "2026-06-11T00:30:00.000Z",
        updated_at: "2026-06-11T00:30:00.000Z",
      },
    ],
    focus_sessions: [],
    focus_segments: [],
    session_reviews: [],
    session_review_labels: [],
    break_bank_transactions: [],
    break_sessions: [],
    sleep_logs: [],
    app_settings: [],
  },
};

type ArrivalSessionRow = {
  id: string;
  arrived_at: string;
  left_at?: string;
};

type FocusSessionRow = {
  id: string;
  arrival_session_id?: string;
};

async function readStoreRows<T>(page: Page, storeName: string): Promise<T[]> {
  return page.evaluate((name) => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("status-record-db");

      request.onerror = () => {
        reject(request.error ?? new Error("无法打开 IndexedDB。"));
      };

      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction(name, "readonly");
        const store = transaction.objectStore(name);
        const getAllRequest = store.getAll();

        getAllRequest.onerror = () => {
          database.close();
          reject(getAllRequest.error ?? new Error("无法读取 IndexedDB。"));
        };

        getAllRequest.onsuccess = () => {
          const rows = getAllRequest.result;
          database.close();
          resolve(rows);
        };
      };
    });
  }, storeName) as Promise<T[]>;
}

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

  await expect(page.getByText("复盘已保存，已开始记录下一轮拖延。")).toBeVisible();
  await expect(page.getByText("今日专注")).toBeVisible();
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

  await expect(page.getByText("复盘已保存，已开始记录下一轮拖延。")).toBeVisible();
  await expect(page.getByText("今日拖延")).toBeVisible();
  await expect(page.locator(".stat-card").filter({ hasText: "今日拖延" }).getByText("0 分钟")).toBeVisible();
});

test("keeps the existing arrival when starting focus", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "到岗" }).click();
  await expect(page.getByText("已到岗", { exact: true })).toBeVisible();

  const beforeArrivalSessions = await readStoreRows<ArrivalSessionRow>(
    page,
    "arrival_sessions",
  );
  const beforeOpenArrivals = beforeArrivalSessions.filter(
    (arrival) => !arrival.left_at,
  );
  expect(beforeOpenArrivals).toHaveLength(1);

  await page.getByLabel("自定义分钟").fill("1");
  await page.getByRole("button", { name: /^开始$/ }).click();
  await expect(page.getByText("专注中")).toBeVisible();

  const afterArrivalSessions = await readStoreRows<ArrivalSessionRow>(
    page,
    "arrival_sessions",
  );
  const afterOpenArrivals = afterArrivalSessions.filter(
    (arrival) => !arrival.left_at,
  );

  expect(afterOpenArrivals).toHaveLength(1);
  expect(afterOpenArrivals[0]).toMatchObject({
    id: beforeOpenArrivals[0]?.id,
    arrived_at: beforeOpenArrivals[0]?.arrived_at,
  });
});

test("uses the first open arrival if duplicate open arrivals exist", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByLabel("导入 JSON 文件").setInputFiles({
    name: "status-record-duplicate-open-arrival.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(duplicateOpenArrivalFixture)),
  });
  await expect(page.getByText("已导入")).toBeVisible();

  await page.getByLabel("自定义分钟").fill("1");
  await page.getByRole("button", { name: /^开始$/ }).click();
  await expect(page.getByText("专注中")).toBeVisible();

  const focusSessions = await readStoreRows<FocusSessionRow>(
    page,
    "focus_sessions",
  );

  expect(focusSessions).toHaveLength(1);
  expect(focusSessions[0]?.arrival_session_id).toBe("arrival-open-first");
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

test("earns break balance from cumulative daily focus minutes", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("导入 JSON 文件").setInputFiles({
    name: "status-record-cumulative-break.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(cumulativeBreakPendingReviewFixture)),
  });

  await expect(page.getByRole("heading", { name: "本轮复盘" })).toBeVisible();
  await expect(
    page.getByText("本轮 15 分钟，获得 5 分钟休息。"),
  ).toBeVisible();

  await page.getByRole("radio", { name: "使用休息" }).check();
  await expect(page.getByLabel("休息倒计时分钟数")).toHaveValue("5");
  await page.getByRole("button", { name: "保存复盘" }).click();

  await expect(page.getByText("复盘已保存，休息倒计时已开始。")).toBeVisible();
  await expect(page.locator(".timer-caption")).toHaveText("休息中");
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

test("pauses into procrastination and can resume the same focus timer", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("自定义分钟").fill("1");
  await page.getByRole("button", { name: "开始" }).click();
  await expect(page.getByText("专注中")).toBeVisible();

  await page.getByRole("button", { name: "暂停" }).click();
  await expect(page.getByText("已暂停，正在记录拖延。")).toBeVisible();
  await expect(page.locator(".timer-caption")).toHaveText("暂停中，正在记录拖延");

  await page.getByRole("button", { name: "继续" }).click();
  await expect(page.getByText("已继续专注。")).toBeVisible();
  await expect(page.locator(".timer-caption")).toHaveText("专注中");

  await page.getByRole("button", { name: "完成" }).click();
  await expect(page.getByText("已按当前专注时长结束本轮，请复盘。")).toBeVisible();
  await expect(page.getByRole("heading", { name: "本轮复盘" })).toBeVisible();
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
    page.getByText(
      /2026-06-10( · 时区 Asia\/Tokyo)? · 每点 5 分钟 · 每列 (30 分钟|1 小时)/,
    ),
  ).toBeVisible();
  await expect(page.getByText("专注 19")).toBeVisible();
  await page.getByRole("button", { name: "前一天" }).click();
  await expect(
    page.getByText(
      /2026-06-09( · 时区 Asia\/Tokyo)? · 每点 5 分钟 · 每列 (30 分钟|1 小时)/,
    ),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "点阵日期" }).fill("2026-06-03");
  await expect(
    page.getByText(
      /2026-06-03( · 时区 Asia\/Tokyo)? · 每点 5 分钟 · 每列 (30 分钟|1 小时)/,
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "后一天" }).click();
  await expect(
    page.getByText(
      /2026-06-04( · 时区 Asia\/Tokyo)? · 每点 5 分钟 · 每列 (30 分钟|1 小时)/,
    ),
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

  const blockerPanel = page.locator(".chart-panel").filter({ hasText: "不专注原因" });
  await blockerPanel.getByRole("button", { name: "太累 2" }).click();
  await expect(page.getByText("当前只看「太累」相关记录")).toBeVisible();
  await expect(page.getByText("睡眠不足，写文档时注意力维持不住。")).toBeVisible();
  await expect(page.getByText("完成统计页面图表。")).not.toBeVisible();
});

test("shows weekly day timelines and navigates weeks", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "示例数据" }).click();
  await expect(page.getByText("已加载 10 天示例数据")).toBeVisible();

  await page.getByRole("button", { name: "周点阵" }).click();
  await expect(page.getByRole("heading", { name: "周点阵" })).toBeVisible();
  await expect(page.getByText("2026-06-08 到 2026-06-14")).toBeVisible();
  await expect(page.getByRole("heading", { name: /2026-06-10/ })).toBeVisible();
  await expect(page.locator('[aria-label="2026-06-10 日点阵"]')).toBeVisible();

  await page.getByRole("button", { name: "上一周" }).click();
  await expect(page.getByText("2026-06-01 到 2026-06-07")).toBeVisible();
  await expect(page.getByRole("heading", { name: /2026-06-03/ })).toBeVisible();

  await page.getByRole("button", { name: "下一周" }).click();
  await expect(page.getByText("2026-06-08 到 2026-06-14")).toBeVisible();

  await page.getByRole("textbox", { name: "周点阵日期" }).fill("2026-06-03");
  await expect(page.getByText("2026-06-01 到 2026-06-07")).toBeVisible();
});

test("keeps data actions available when sidebar actions are hidden", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto("/");

  const workspaceActions = page.locator(".workspace-data-actions");
  await expect(page.locator(".side-actions").getByRole("button", { name: "导入" })).toBeHidden();
  await expect(workspaceActions.getByRole("button", { name: "示例数据" })).toBeVisible();
  await expect(workspaceActions.getByRole("button", { name: "导入" })).toBeVisible();
  await expect(workspaceActions.getByRole("button", { name: "导出" })).toBeVisible();

  const fileChooserPromise = page.waitForEvent("filechooser");
  await workspaceActions.getByRole("button", { name: "导入" }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: "status-record-responsive-import.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backupFixture)),
  });

  await expect(page.getByText("已导入 7 条记录。")).toBeVisible();
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
    page.locator(".stat-card").filter({ hasText: "专注时长" }).getByText("25 分钟"),
  ).toBeVisible();
  await expect(page.getByText("暂无不专注原因记录。")).toBeVisible();
  await expect(page.getByText("导入备份里的可见产物记录")).toBeVisible();
});
