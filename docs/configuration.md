# 配置与部署

## 环境变量

所有配置通过 `.env` 文件或环境变量设置，前缀 `VEHIX_`。

### 数据库

```bash
# SQLite（默认，零配置）
VEHIX_DATABASE_URL=sqlite+aiosqlite:///./vehix.db

# PostgreSQL（取消注释 + docker compose up -d postgres）
# VEHIX_DATABASE_URL=postgresql+asyncpg://xtream:xtream@localhost:5432/xtream
```

迁移工具：Alembic。

```bash
cd backend
alembic -c alembic.ini revision --autogenerate -m "描述"  # 生成迁移
alembic -c alembic.ini upgrade head                        # 执行
alembic -c alembic.ini downgrade -1                        # 回滚
```

### LLM

```bash
VEHIX_LLM_API_KEY=sk-...                # API Key
VEHIX_LLM_BASE_URL=https://api.deepseek.com
VEHIX_LLM_MODEL=deepseek-chat
```

支持任何 OpenAI 兼容接口。不配 Key 时 Agent 退化为规则模式。

API 端点：

```bash
GET  /api/llm/status   # 查看当前配置（Key 脱敏）
POST /api/llm/test     # 测试新 Key 是否有效（不保存）
```

### 认证

```bash
VEHIX_JWT_SECRET=<openssl rand -hex 32>   # 生产必须更换（默认值会打启动告警）
VEHIX_JWT_EXPIRE_MINUTES=15
VEHIX_JWT_REFRESH_DAYS=7
VEHIX_INITIAL_SUPERUSER_PASSWORD=admin123
VEHIX_INITIAL_ADMIN_PASSWORD=admin123
VEHIX_INITIAL_OPERATOR_PASSWORD=operator123
VEHIX_INITIAL_VIEWER_PASSWORD=viewer123

# MCP HTTP 端点（默认关闭；Agent 始终使用进程内 ToolRegistry）
# VEHIX_MCP_HTTP_ENABLED=false
```

健康检查：`GET /api/health` 仅探测 DB + 模拟器。LLM 连通性请用需鉴权的 `GET /api/llm/status` / `POST /api/llm/test`。

首次启动自动创建 4 个账户：

| 用户名 | 默认密码 | 角色 |
|--------|---------|------|
| superuser | admin123 | 所有权限 |
| admin | admin123 | 管理审批 + OTA |
| operator | operator123 | 低风险车控 + 只读 |
| viewer | viewer123 | 只读 |

### 模拟器

```bash
VEHIX_SIMULATOR_ENABLED=true
VEHIX_SIMULATOR_VEHICLE_COUNT=10
VEHIX_SIMULATOR_TELEMETRY_INTERVAL_S=5.0
VEHIX_SIMULATOR_FAULT_PROBABILITY=0.02
```

### JT/T 808 商用车

```bash
VEHIX_JTT808_ENABLED=false              # 设为 true 启用 xtream-codec 网关
VEHIX_JTT808_BASE_URL=http://localhost:8808
VEHIX_JTT808_MOCK_ENABLED=true          # 本地 Python 模拟（无需 Docker）
```

### Rust 安全核

```bash
VEHIX_RUST_COMMAND_GATEWAY_ENABLED=false
VEHIX_RUST_UDS_PARSER_ENABLED=false
VEHIX_RUST_OTA_VERIFIER_ENABLED=false
```

默认使用 Python fallback。设为 `true` 后调用 PyO3 模块（需先编译 Rust crate）。

### 服务器

```bash
VEHIX_HOST=0.0.0.0
VEHIX_PORT=8000
VEHIX_CORS_ORIGINS=["http://localhost:5173","http://localhost:3000"]
```

---

## Docker Compose

```bash
# 基础模式（仅后端 + 前端 + 模拟器）
docker compose up -d

# 含 JT/T 808 网关
docker compose --profile jtt up -d

# 含 PostgreSQL
docker compose up -d postgres
```

### 服务端口

| 服务 | 端口 | 说明 |
|------|------|------|
| backend | 8000 | FastAPI + Agent SSE |
| frontend | 5173 | Vite dev server |
| postgres | 5432 | 可选，默认 SQLite |
| xtream-codec | 8808/8888 | JT/T 808 网关 + Dashboard（jtt profile） |

---

## 权限模型

### 角色-操作矩阵

| 操作 | viewer | operator | admin | superuser |
|------|--------|----------|-------|-----------|
| 查看车队/车辆/遥测/DTC | ✅ | ✅ | ✅ | ✅ |
| Agent 对话 | ✅ | ✅ | ✅ | ✅ |
| 低风险车控 | ❌ | ✅ | ✅ | ✅ |
| 中/高危车控 | ❌ | ❌ | ✅ | ✅ |
| 车控审批 | ❌ | ❌ | ✅ | ✅ |
| OTA 管理 | ❌ | ❌ | ✅ | ✅ |
| 系统配置 | ❌ | ❌ | ❌ | ✅ |
| 审计日志查看 | ❌ | ❌ | ❌ | ✅ |

### 车控风险分级

| 命令 | 风险 | 审批 |
|------|------|------|
| unlock_door / start_hvac / charge_control | low | 无需 |
| limit_power / clear_dtc | medium | admin |
| remote_shutdown | critical | admin |

### API 鉴权

```bash
# 获取 Token
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# 使用 Token
curl http://localhost:8000/api/vehicles \
  -H "Authorization: Bearer <access_token>"
```

---

## LLM Key 管理策略

采用 12-Factor App 方法论：Key 通过环境变量注入，不做应用层加密存储。

**理由**：
- 密钥管理应交给专业 Secret Manager（Vault / K8s Secret）
- 环境变量方案是业界默认，零额外代码
- 生产切换只需改注入方式，业务代码零改动

**测试新 Key（不保存）**：

```bash
curl -X POST http://localhost:8000/api/llm/test \
  -H "Content-Type: application/json" \
  -d '{"api_key":"sk-...","model":"deepseek-chat"}'
```
