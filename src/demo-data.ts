export interface DemoFocusSeed {
  minutes: number;
  status: string;
  switches: number;
  products: string[];
  note: string;
  blockers: string[];
  blockerNote?: string;
}

export interface DemoDaySeed {
  date: string;
  arrival: string;
  delay: number;
  sessions: DemoFocusSeed[];
  breakUsed: number;
  sleep: number;
  energy: 1 | 2 | 3 | 4 | 5;
}

export const demoDays: DemoDaySeed[] = [
  {
    date: "2026-06-01",
    arrival: "09:00",
    delay: 20,
    sessions: [
      {
        minutes: 25,
        status: "status-completed",
        switches: 1,
        products: ["product-note"],
        note: "整理番茄钟需求笔记，写出核心指标列表。",
        blockers: ["blocker-none"],
      },
      {
        minutes: 50,
        status: "status-partial",
        switches: 3,
        products: ["product-note", "product-excerpt"],
        note: "阅读相关文章并摘录可用想法，还没完全归纳完。",
        blockers: ["blocker-unclear"],
        blockerNote: "材料太散，下一轮需要先列清楚判断标准。",
      },
    ],
    breakUsed: 5,
    sleep: 420,
    energy: 3,
  },
  {
    date: "2026-06-02",
    arrival: "08:50",
    delay: 10,
    sessions: [
      {
        minutes: 25,
        status: "status-completed",
        switches: 0,
        products: ["product-code"],
        note: "搭建了项目文档结构。",
        blockers: ["blocker-none"],
      },
      {
        minutes: 25,
        status: "status-completed",
        switches: 1,
        products: ["product-file"],
        note: "补齐 API contract 初稿。",
        blockers: ["blocker-none"],
      },
      {
        minutes: 45,
        status: "status-stuck",
        switches: 5,
        products: ["product-note"],
        note: "卡在启动延迟记录口径，写了几个备选方案。",
        blockers: ["blocker-hard", "blocker-unclear"],
        blockerNote: "自动计算和手动纠错的边界还没想清楚。",
      },
    ],
    breakUsed: 10,
    sleep: 405,
    energy: 4,
  },
  {
    date: "2026-06-03",
    arrival: "09:15",
    delay: 45,
    sessions: [
      {
        minutes: 25,
        status: "status-interrupted",
        switches: 6,
        products: ["product-note"],
        note: "记录被打断原因，保留了后续处理清单。",
        blockers: ["blocker-interrupted"],
        blockerNote: "临时消息进来后没有及时关掉通知。",
      },
      {
        minutes: 25,
        status: "status-partial",
        switches: 4,
        products: ["product-exercise"],
        note: "做完 6 道练习题，错题还没复盘。",
        blockers: ["blocker-tired"],
        blockerNote: "精力低，后半段明显开始跳读题目。",
      },
    ],
    breakUsed: 0,
    sleep: 360,
    energy: 2,
  },
  {
    date: "2026-06-04",
    arrival: "08:40",
    delay: 5,
    sessions: [
      {
        minutes: 50,
        status: "status-completed",
        switches: 1,
        products: ["product-code"],
        note: "完成本地数据 schema 草案。",
        blockers: ["blocker-none"],
      },
      {
        minutes: 50,
        status: "status-completed",
        switches: 2,
        products: ["product-code", "product-file"],
        note: "实现统计聚合函数初版。",
        blockers: ["blocker-none"],
      },
      {
        minutes: 25,
        status: "status-completed",
        switches: 1,
        products: ["product-note"],
        note: "写了当天复盘摘要。",
        blockers: ["blocker-none"],
      },
    ],
    breakUsed: 10,
    sleep: 450,
    energy: 5,
  },
  {
    date: "2026-06-05",
    arrival: "09:30",
    delay: 30,
    sessions: [
      {
        minutes: 25,
        status: "status-stuck",
        switches: 7,
        products: ["product-code"],
        note: "调试 IndexedDB 初始化，定位到默认标签重复问题。",
        blockers: ["blocker-hard"],
        blockerNote: "对 Dexie 初始化流程不熟，查资料花了太久。",
      },
      {
        minutes: 45,
        status: "status-partial",
        switches: 4,
        products: ["product-code"],
        note: "修复一部分数据写入流程，剩余 UI 还没接好。",
        blockers: ["blocker-unclear"],
        blockerNote: "服务层和组件职责边界还需要拆清楚。",
      },
    ],
    breakUsed: 5,
    sleep: 390,
    energy: 3,
  },
  {
    date: "2026-06-06",
    arrival: "10:00",
    delay: 60,
    sessions: [
      {
        minutes: 25,
        status: "status-shifted",
        switches: 8,
        products: ["product-other"],
        note: "原计划学习，但临时转去处理杂事。",
        blockers: ["blocker-boring", "blocker-interrupted"],
        blockerNote: "任务本身吸引力低，又被临时事情打断。",
      },
    ],
    breakUsed: 0,
    sleep: 480,
    energy: 3,
  },
  {
    date: "2026-06-07",
    arrival: "09:20",
    delay: 15,
    sessions: [
      {
        minutes: 90,
        status: "status-completed",
        switches: 2,
        products: ["product-ppt", "product-note"],
        note: "完成复盘 PPT 大纲和两页草稿。",
        blockers: ["blocker-none"],
      },
      {
        minutes: 25,
        status: "status-completed",
        switches: 1,
        products: ["product-excerpt"],
        note: "整理了一组引用材料。",
        blockers: ["blocker-none"],
      },
    ],
    breakUsed: 10,
    sleep: 435,
    energy: 4,
  },
  {
    date: "2026-06-08",
    arrival: "08:55",
    delay: 25,
    sessions: [
      {
        minutes: 50,
        status: "status-completed",
        switches: 2,
        products: ["product-code"],
        note: "完成番茄钟主界面布局。",
        blockers: ["blocker-none"],
      },
      {
        minutes: 25,
        status: "status-interrupted",
        switches: 5,
        products: ["product-note"],
        note: "写复盘弹窗时被会议打断。",
        blockers: ["blocker-interrupted"],
        blockerNote: "会议结束后没有马上回到原来的上下文。",
      },
      {
        minutes: 25,
        status: "status-completed",
        switches: 1,
        products: ["product-code"],
        note: "补上休息余额计算。",
        blockers: ["blocker-none"],
      },
    ],
    breakUsed: 10,
    sleep: 420,
    energy: 4,
  },
  {
    date: "2026-06-09",
    arrival: "09:05",
    delay: 35,
    sessions: [
      {
        minutes: 25,
        status: "status-partial",
        switches: 4,
        products: ["product-file"],
        note: "补了一部分测试策略文档。",
        blockers: ["blocker-tired"],
        blockerNote: "睡眠不足，写文档时注意力维持不住。",
      },
      {
        minutes: 50,
        status: "status-completed",
        switches: 2,
        products: ["product-code"],
        note: "完成睡眠记录和标签管理。",
        blockers: ["blocker-none"],
      },
    ],
    breakUsed: 5,
    sleep: 375,
    energy: 2,
  },
  {
    date: "2026-06-10",
    arrival: "08:45",
    delay: 12,
    sessions: [
      {
        minutes: 45,
        status: "status-completed",
        switches: 1,
        products: ["product-code"],
        note: "完成统计页面图表。",
        blockers: ["blocker-none"],
      },
      {
        minutes: 25,
        status: "status-completed",
        switches: 0,
        products: ["product-file", "product-note"],
        note: "整理发布前检查清单。",
        blockers: ["blocker-none"],
      },
      {
        minutes: 25,
        status: "status-completed",
        switches: 1,
        products: ["product-code"],
        note: "修复睡眠录入体验。",
        blockers: ["blocker-none"],
      },
    ],
    breakUsed: 10,
    sleep: 465,
    energy: 5,
  },
];
