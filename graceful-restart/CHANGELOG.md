# Changelog - graceful-restart

## English

### v1.0.0 (2026-02-22)

#### 🎉 Initial Release
- **Problem:** Gateway restart loses session context
- **Solution:** Auto-restart with self-wakeup using cron + system-event
- **Default delay:** 10 seconds

---

## 中文

### v1.0.0 (2026-02-22)

#### 🎉 初始版本
- **问题**：Gateway 重启后会丢失会话上下文
- **方案**：使用 cron + system-event 实现重启后自唤醒
- **默认延迟**：10 秒
