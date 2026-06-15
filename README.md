# Status Record

个人学习和深度工作记录工具。第一版是本地优先网页应用：番茄钟、手动记录、到岗拖延统计、结束复盘、休息余额、休息倒计时、标签统计和每日睡眠记录都保存在浏览器本地 IndexedDB。

## 本地开发

```bash
npm install
npm run dev
```

打开 Vite 输出的本地地址，通常是 `http://127.0.0.1:5173`。

## 网页部署

项目已配置 GitHub Pages 静态部署。推送到 `main` 后，GitHub Actions 会运行测试、lint、构建 `dist`，并发布到：

https://lapse-code.github.io/status-record/

## 常用命令

```bash
npm run test:run
npm run lint
npm run build
npm run e2e
```

## 数据说明

- 数据默认只保存在当前浏览器本地。
- 应用内提供 JSON 导出和导入。导出格式为 `status-record.backup` version 1，导入会合并写入本地 IndexedDB。
- 右上角 `示例数据` 可以加载 2026-06-01 到 2026-06-10 的 demo 记录；重复点击会覆盖旧 demo 记录，不会删除真实记录。
- 统计数据从原始记录计算，不依赖后端服务。

## 文档

项目文档在 `docs/`。实现前后都应保持文档和代码行为一致。
