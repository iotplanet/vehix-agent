# 路线图

## 当前状态 (v0.2.0+)

### 后端

| 模块 | 状态 | 说明 |
|------|------|------|
| Agent 编排 | ✅ | LangGraph 5 节点状态图 + SSE；前端稳定 `thread_id` 支持多轮 |
| MCP 工具层 | ✅ | 进程内 ToolRegistry；HTTP `/mcp/*` 默认关闭，开启需 Admin |
| 车辆模拟器 | ✅ | GB/T 32960 + JT/T 808 mock |
| 权限系统 | ✅ | JWT + RBAC；读接口 RequireViewer，写/审批按角色强制校验 |
| OTA 管理 | ✅ | 灰度批次 + 暂停/继续/回滚 |
| 工单系统 | ✅ | MCP 创建 + REST 列表/状态流转 + 前端列表页 |
| 审计日志 | ✅ | 命令下发/审批/删车等 |
| LLM 集成 | ✅ | DeepSeek/OpenAI 兼容；`/api/llm/*` 需 Admin |
| 真流式 SSE | ✅ | summarizer → SSE → 前端逐字渲染 |
| Rust 安全核 | ⚠️ | 3 个 crate + Python fallback；PyO3 未接入 |
| 数据库 | ⚠️ | 启动 `create_all`；Alembic 相对路径可用；Docker SQLite volume |
| 测试 | ✅ | pytest：鉴权矩阵 / 审批 / registry；CI 推镜像前必跑 |
| MQTT | ❌ | 内存 EventBus |
| 运行时限制 | ⚠️ | ApprovalQueue / MemorySaver 为进程内状态，不适合多副本 |

### 前端

| 模块 | 状态 | 说明 |
|------|------|------|
| 车队地图 | ✅ | 高德地图 + KPI；API 错误可见提示 |
| 车辆孪生 | ✅ | 自适应面板；Admin 可删车 |
| Agent 控制台 | ✅ | SSE + `thread_id` 多轮 + 审批卡片 |
| OTA 管理 | ✅ | 创建 / 暂停 / 继续 / 回滚 |
| 工单 | ✅ | 列表 + 状态流转操作 |
| 权限 | ✅ | 登录 + 路由守卫；设置页 Admin+ |
| 移动端 | ✅ | 汉堡菜单 + 响应式 |
| 系统设置 | ✅ | LLM 状态 / Key 测试（Admin+） |
| 测试 | ✅ | vitest：SSE parser / api helpers / authStore |

---

## 近期已完成（相对原 Beta 清单）

- [x] 前后端最小测试 + CI 门禁
- [x] OTA 灰度暂停/继续
- [x] 工单生命周期闭环（REST + UI）
- [x] API 鉴权补齐 / MCP 收口 / clear_dtc 审批对齐
- [x] Health 不探 LLM / Docker 持久化 / 生产镜像无 reload

## 中期 (架构深度)

| 项目 | 说明 |
|------|------|
| Rust PyO3 接入 | 三个 crate 的 Python 绑定，替代 Python fallback |
| 配置中心 | 运行时配置 API + 版本历史 |
| 审计日志升级 | SIEM 推送 + 不可篡改 |
| MQTT (EMQX) | 替代内存 EventBus，支持真实 T-Box 接入 |
| PostgreSQL 正式迁移 | 读写分离 + 分区表 |
| 多副本会话 | Redis 化 MemorySaver + ApprovalQueue |

## 远期 (生产级)

详见 [production.md](./production.md)

| 领域 | 关键项 |
|------|------|
| 可观测性 | Prometheus + Grafana + OpenTelemetry |
| 可靠性 | K8s 多副本 + 熔断降级 + 幂等 |
| 安全性 | mTLS + Vault + 等保 |
| 性能 | Redis 缓存 + 读写分离 + 消息队列 |
| 合规 | GB/T 32960 平台过检 |
| 语音交互 | 阿里云 ISI ASR+TTS (预留接口) |

## 已完成的重大里程碑

- [x] MCP 工具化
- [x] LangGraph Agent 编排
- [x] 多协议混合车队（GB/T 32960 + JT/T 808）
- [x] 车控审批门禁（含 clear_dtc）
- [x] 流式 SSE + LLM 集成
- [x] JWT + RBAC（API 强制校验）
- [x] OTA 灰度 + 暂停/继续
- [x] 工单 REST + UI
- [x] Alembic（相对路径）+ create_all 启动策略
- [x] 结构化日志 / PostgreSQL 可切换
- [x] 最小自动化测试 + ACR 推送前 CI
- [x] HTTPS 子路径部署示例
