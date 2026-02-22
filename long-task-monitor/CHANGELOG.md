# Changelog - Long Task Monitor

## English

### v1.0.0 (2026-02-22)

#### 🎉 Initial Release
- **Worker-Monitor Architecture**: Long-running task monitoring solution V2
- **Monitor**: Tracks Worker status via hook-logger logs, 10 minutes per round, reports via Announce
- **Main Session Polling**: Uses polling mechanism due to subagent sessions_send limitation

---

## 中文

### v1.0.0 (2026-02-22)

#### 🎉 初始版本
- **Worker-Monitor 架构**：长任务监控方案 V2
- **Monitor**：通过 hook-logger 日志监控 Worker，每轮 10 分钟 Announce 汇报
- **主会话轮询**：因子代理 sessions_send 限制采用轮询机制
