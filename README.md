# ⚡ Vehix Agent

智能车队运维 Agent 架构原型 — MCP 工具化 + LangGraph 多智能体编排，跨协议统一车队管理。

> **核心验证**：MCP 工具标准化、LLM 多步诊断推理、车控安全审批门禁、多协议混合车队管理。

## 数据库迁移

使用 Alembic 管理数据库 schema 变更：

```bash
cd backend
source venv/bin/activate

# 生成迁移（模型变更后）
alembic -c alembic.ini revision --autogenerate -m "描述"

# 执行迁移
alembic -c alembic.ini upgrade head

# 回滚一步
alembic -c alembic.ini downgrade -1
```

## 快速启动

```bash
# 后端
cd backend
cp .env.example .env    # 编辑 .env 填入 LLM Key 和 JWT Secret
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python -m app.main       # http://localhost:8000

# 前端
cd frontend
cp .env.example .env     # 编辑 .env 填入高德地图 Key
pnpm install && pnpm dev # http://localhost:5173
```

## 默认账户

首次启动自动创建以下账户（密码存储在 `.env` 的 `VEHIX_INITIAL_SUPERUSER_PASSWORD`）：

| 用户名 | 默认密码 | 角色 | 权限范围 |
|--------|---------|------|---------|
| `superuser` | `admin123` | 超级管理员 | 所有权限 + 系统配置 |
| `admin` | `admin123` | 管理员 | 车控审批、OTA 管理、车辆注册 |
| `operator` | `operator123` | 操作员 | 低风险车控、工单管理、只读 |
| `viewer` | `viewer123` | 查看者 | 只读：车队、遥测、DTC |

## 安全策略

### 身份认证

- **JWT Bearer Token**：`POST /api/auth/login` 获取 access token（15 分钟）和 refresh token（7 天）
- **密码哈希**：bcrypt (cost factor 12)
- **Token 刷新**：`POST /api/auth/refresh` 使用 refresh token 换取新 token

### 角色权限 (RBAC)

| 操作 | viewer | operator | admin | superuser |
|------|--------|----------|-------|-----------|
| 查看车队/车辆/遥测/DTC | ✅ | ✅ | ✅ | ✅ |
| Agent 对话查询 | ✅ | ✅ | ✅ | ✅ |
| 低风险车控（解锁/空调/充电） | ❌ | ✅ | ✅ | ✅ |
| 中风险车控（限功率/清DTC） | ❌ | ❌ | ✅ | ✅ |
| 高危车控审批 | ❌ | ❌ | ✅ | ✅ |
| OTA 管理 | ❌ | ❌ | ✅ | ✅ |
| 车辆注册/删除 | ❌ | ❌ | ✅ | ✅ |
| 系统配置管理 | ❌ | ❌ | ❌ | ✅ |

### 车控审批流

```
operator 发起命令
  ├─ 低风险 → 直接执行
  ├─ 中风险 → 需 admin 审批 → 下发
  └─ 高危 (remote_shutdown) → 需 admin 审批 → 下发
```

### LLM 配置

遵循 **12-Factor App** 方法论，LLM Key 通过环境变量注入，不做应用层加密存储。

```bash
# 1. 查看当前配置状态（不泄露完整 Key）
curl http://localhost:8000/api/llm/status
# → {"configured":true, "model":"deepseek-chat", "key_preview":"sk-7752****8ad"}

# 2. 测试新 Key 是否有效（不保存，仅验证）
curl -X POST http://localhost:8000/api/llm/test \
  -H "Content-Type: application/json" \
  -d '{"api_key":"sk-your-new-key","base_url":"https://api.deepseek.com","model":"deepseek-chat"}'
# → {"ok":true, "model":"deepseek-chat", "latency_ms":82.5}

# 3. 测试通过后，修改 .env 或 docker-compose.yml，重启生效
```

**为什么这样设计**：密钥管理应交给专业的 Secret Manager（K8s Secret / Vault / AWS Secrets Manager），不应该在应用层重造轮子。当前简单场景用 `.env` 环境变量，生产环境升级为零代码改动。

### 安全加固建议

- [ ] 生产环境使用 `openssl rand -hex 32` 生成 `VEHIX_JWT_SECRET`
- [ ] 更换所有默认账户密码
- [ ] 启用 HTTPS（JWT 明文传输风险）
- [ ] 配置 CORS 白名单（当前默认允许 localhost 开发端口）
- [ ] 登录接口添加速率限制（5 次/分钟/IP）

## 权限测试

```bash
# 登录获取 token
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# 使用 token 下发命令
curl -X POST http://localhost:8000/api/vehicles/LSVAU2A0000000/commands \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"command":"unlock_door"}'

# viewer 尝试下发命令 → 403 Forbidden
curl -X POST http://localhost:8000/api/vehicles/LSVAU2A0000000/commands \
  -H "Authorization: Bearer <viewer_token>" \
  -H "Content-Type: application/json" \
  -d '{"command":"unlock_door"}'
```

## 技术栈

- **后端**: Python / FastAPI / LangGraph / SQLAlchemy / SQLite (可切换 PostgreSQL)
- **前端**: React 19 / HeroUI v3 / Tailwind CSS v4 / ECharts / AMap
- **协议**: GB/T 32960 (新能源) / JT/T 808 (商用车) / UDS ISO 14229 (诊断)
- **工具标准**: MCP (Model Context Protocol)
- **Rust 扩展**: Command Gateway / UDS Parser / OTA Verifier

## 项目结构

```
vehix-agent/
├── backend/
│   ├── app/
│   │   ├── agent/         # LangGraph 多智能体编排
│   │   ├── api/           # REST API + SSE streaming
│   │   ├── auth/          # JWT 认证 + RBAC 权限
│   │   ├── mcp/           # MCP 工具层 (17 个工具)
│   │   ├── models/        # ORM 模型 (8 个表)
│   │   └── simulator/     # 车辆模拟器 (GB/T 32960 + JT/T 808)
│   └── rust-services/     # Rust 安全模块 (WIP)
├── frontend/              # React SPA
└── docs/                  # 设计文档
    ├── xtream-codec-integration.md
    └── auth-and-config-design.md
```
