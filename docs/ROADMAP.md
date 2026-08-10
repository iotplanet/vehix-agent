# 路线图

## 当前状态 (v0.2.0)

### 后端

| 模块 | 状态 | 说明 |
|------|------|------|
| Agent 编排 | ✅ | LangGraph 5 节点状态图（router → planner → executor → approver → summarizer），`graph.astream()` 节点级流式 |
| MCP 工具层 | ✅ | 17 个工具，装饰器注册，覆盖车辆查询、诊断、OTA、商用车 JT/T 808 |
| 车辆模拟器 | ✅ | GB/T 32960（10 台新能源）+ JT/T 808（5 台商用车），故障注入 + SOH 退化 |
| 权限系统 | ✅ | JWT + RBAC 四角色，车控分级审批 |
| OTA 管理 | ✅ | 灰度发布批次计算 + 模拟安装进度 |
| 工单系统 | ✅ | 创建 + 查询，故障诊断自动创建 |
| 审计日志 | ✅ | 命令下发/审批记录 |
| LLM 集成 | ✅ | DeepSeek/OpenAI 兼容，`llm_stream()` 逐 token 流式输出，结构化诊断 |
| 真流式 SSE | ✅ | `token_queue` 管道：summarizer → SSE → 前端逐字渲染 |
| Rust 安全核 | ⚠️ | 3 个 crate 已有代码和测试，Python fallback 就绪，PyO3 待接入 |
| 数据库 | ⚠️ | SQLite 默认，PostgreSQL 一行配置切换 |
| 测试 | ❌ | 两侧均无测试用例 |
| MQTT | ❌ | 使用内存 EventBus 替代 |

### 前端

| 模块 | 状态 | 说明 |
|------|------|------|
| 车队地图 | ✅ | 高德地图 + 混合车队标记 + 统计卡片 |
| 车辆孪生 | ✅ | NEV/商用车自适应面板 + ECharts 遥测曲线 |
| Agent 控制台 | ✅ | SSE 流式对话 + LLM 逐字输出 + 审批内嵌卡片 + Markdown 渲染 |
| OTA 管理 | ✅ | 任务列表 + 创建表单 + 进度条 |
| 权限 | ✅ | 登录页 + JWT 自动注入 + 路由守卫 |
| 移动端 | ✅ | 汉堡菜单 + 响应式布局 |
| 系统设置 | ✅ | LLM 状态查看 + Key 测试 |
| 测试 | ❌ | 无 |

---

## 近期 (Beta 完善)

| 项目 | 优先级 | 工作量 |
|------|--------|--------|
| 前端测试 (vitest) | P1 | 2d |
| 后端测试 (pytest) | P1 | 2d |
| OTA 灰度暂停/继续 | P2 | 0.5d |
| 工单生命周期闭环 | P2 | 0.5d |

## 中期 (架构深度)

| 项目 | 说明 |
|------|------|
| Rust PyO3 接入 | 三个 crate 的 Python 绑定，替代 Python fallback |
| 配置中心 | 运行时配置 API + 版本历史 |
| 审计日志升级 | SIEM 推送 + 不可篡改 |
| MQTT (EMQX) | 替代内存 EventBus，支持真实 T-Box 接入 |
| PostgreSQL 正式迁移 | 读写分离 + 分区表 |

## 远期 (生产级)

详见 [production.md](./production.md)

| 领域 | 关键项 |
|------|--------|
| 可观测性 | Prometheus + Grafana + OpenTelemetry |
| 可靠性 | K8s 多副本 + 熔断降级 + 幂等 |
| 安全性 | mTLS + Vault + 等保 |
| 性能 | Redis 缓存 + 读写分离 + 消息队列 |
| 合规 | GB/T 32960 平台过检 |
| 语音交互 | 阿里云 ISI ASR+TTS，解放双手 (预留接口) |

## 已完成的重大里程碑

- [x] MCP 工具化（17 tools）
- [x] LangGraph Agent 编排
- [x] 多协议混合车队（GB/T 32960 + JT/T 808）
- [x] 车控审批门禁
- [x] 流式 SSE + LLM 集成 + 真流式 token 输出
- [x] HeroUI v3 暗色主题
- [x] JWT + RBAC 权限
- [x] OTA 灰度发布
- [x] 结构化诊断输出
- [x] Rust 安全核（Python fallback 就绪）
- [x] Alembic 数据库迁移
- [x] 结构化日志
- [x] PostgreSQL 零成本切换
- [x] 移动端适配
- [x] 语音交互 (预留接口 + 配置占位)
