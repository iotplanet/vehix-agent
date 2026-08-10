# vehix-agent × xtream-codec 集成方案

## 一、项目背景对比

| 维度 | vehix-agent (现有) | xtream-codec (待集成) |
|------|-------------------|----------------------|
| **语言** | Python (FastAPI + LangGraph) | Java 21 (Spring Boot + Netty + Project Reactor) |
| **协议标准** | GB/T 32960（新能源车远程监管） | JT/T 808（商用车定位通信）、JT/T 1078（视频监控） |
| **数据格式** | JSON over MQTT | 二进制 TCP 流（0x7E 帧头/帧尾） |
| **目标车型** | BEV/PHEV 乘用车 | 货车、客车、出租车、危化品运输车 |
| **数据维度** | SOC/SOH/电机温度/电池电压/绝缘电阻 | 油耗/发动机转速/水温/机油压力/载货状态/驾驶员信息 |
| **模拟器** | TBoxMock (Python + event_bus) | Netty TCPServer（二进制编解码） |
| **编解码引擎** | 无（JSON 无需解析） | 注解驱动 `@XtreamField` 二进制 codec |
| **工具协议** | MCP（自定义 ToolRegistry） | REST API（Dashboard 已有） |
| **视频能力** | 无 | JT/T 1078：RTP 流解析 → H.264→FLV、PCM→MP3 |
| **部署** | FastAPI + SQLite | Spring Boot + PostgreSQL + Netty |

## 二、数据模型差异

```
GB/T 32960（新能源乘用车）         JT/T 808（传统商用车）
───────────────────────────       ───────────────────────────
SOC (荷电状态 %)                   油量 / 油耗 (L/100km)
SOH (电池健康度 %)                 发动机运行时长 / 累计里程
电机转速 / 电机温度                发动机转速 / 水温 / 机油压力
电池电压 / 电池电流                蓄电池电压
绝缘电阻                          制动系统状态
动力电池单体温度                   冷却液温度
充电状态 (慢充/快充/未充电)         载货状态 (空载/满载)
                                  驾驶员 IC 卡信息
                                  车辆状态 (ACC 开/关、定位)
JT/T 1078 扩展:
  无                              实时视频流（0x9101 实时传输）
  无                              历史视频回放（0x9201 回放控制）
  无                              音频对讲 (ADPCM/G.711)
  无                              拍照指令 (0x8801)
```

## 三、集成架构方案对比

### 方案 A：MCP 桥接（★★★★★ 推荐）

```
┌─────────────────────────────────────────────────────────┐
│  vehix-agent (Python)                                   │
│  ┌───────────────────────────────────────────────────┐  │
│  │ LangGraph Agent                                   │  │
│  │  IntentRouter → Planner → Executor                │  │
│  │      │                   │                        │  │
│  │      │      ┌────────────┼────────────┐           │  │
│  │      │      │            │            │           │  │
│  │      ▼      ▼            ▼            ▼           │  │
│  │  GB/T 32960 MCP    JT/T 808 MCP   Fleet MCP       │  │
│  │  (现有 5 tools)    (新增 6 tools)  (扩展)          │  │
│  └───────────────────┬───────────────────────────────┘  │
│                      │ REST / MCP SSE                   │
├──────────────────────┼──────────────────────────────────┤
│                      ▼                                   │
│  xtream-codec (Java, Docker sidecar)                    │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Spring Boot REST API Gateway                      │  │
│  │  /api/vehicles          → 车辆列表                 │  │
│  │  /api/vehicles/{id}/loc → 实时位置                 │  │
│  │  /api/vehicles/{id}/tracks → 历史轨迹             │  │
│  │  /api/vehicles/{id}/media → 视频流                 │  │
│  │  /api/drivers           → 驾驶员信息               │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Netty TCPServer (端口 8808/1078)                  │  │
│  │  JT/T 808 ←→ 车载终端实时通信                      │  │
│  │  JT/T 1078 ←→ 视频/音频流                          │  │
│  └───────────────────────────────────────────────────┘  │
│  PostgreSQL (共享数据库)                                 │
└─────────────────────────────────────────────────────────┘
```

**优点**：
- 不改 xtream-codec 一行代码，只新增 REST 接口
- Python 负责 Agent 编排，Java 负责二进制编解码，各自优势领域
- MCP 是 vehix-agent 现有工具协议，扩展成本最低
- Docker Compose 一键拉起两个服务
- xtream-codec 已有的 Dashboard 可独立运行

**缺点**：
- 跨进程 REST 调用有 ~2ms 延迟（对 Agent 场景可忽略）
- 需要维护两个服务的配置和健康检查

### 方案 B：共享数据库（★★★☆☆）

Python Agent 直接查询 xtream-codec 的 PostgreSQL 数据库，绕开 REST。

**优点**：零额外网络开销，实现最简单
**缺点**：
- 强耦合数据库 Schema，xtream-codec 升级可能破坏查询
- 跳过 xtream-codec 的业务逻辑层（如权限校验、数据脱敏）
- 视频流无法通过数据库获取

### 方案 C：Python 重写编解码器（★★☆☆☆）

用 Python 的 `construct` 库重写 JT/T 808/1078 二进制解析。

**优点**：纯 Python 生态，无跨语言依赖
**缺点**：
- 50+ 消息类型，数千个字段，重写成本极高（估计 3-6 人月）
- 丢失 xtream-codec 社区的 bug 修复和协议升级
- JT/T 1078 视频编解码 (H.264→FLV, PCM→MP3) 在 Python 中性能差
- Rust 方案（下面详述）更适合做二进制解析

## 四、推荐方案详细设计

### 4.1 服务拓扑

```
docker-compose.yml
├── backend (Python FastAPI, port 8000)
│   ├── agent/      — LangGraph 编排
│   ├── mcp/        — MCP ToolRegistry
│   │   ├── vehicle_mcp.py      (GB/T 32960, 现有)
│   │   ├── diagnostics_mcp.py  (UDS, 现有)
│   │   ├── ota_mcp.py          (OTA, 现有)
│   │   ├── fleet_mcp.py        (车队统计, 现有)
│   │   ├── jtt808_mcp.py       (JT/T 808 查询, 新增)
│   │   └── jtt1078_mcp.py      (JT/T 1078 视频, 新增)
│   └── simulator/
│       ├── tboot_mock.py       (GB/T 32960 T-Box, 现有)
│       └── jtt808_mock.py      (JT/T 808 终端模拟, 新增)
├── xtream-codec (Java Spring Boot, port 8808)
│   └── jt-808-server-spring-boot-starter-reactive
├── postgres (port 5432)
└── frontend (React, port 5173)
```

### 4.2 新增 MCP 工具

```python
# backend/app/mcp/jtt808_mcp.py

@tool_registry.tool(name="query_jtt808_vehicle", ...)
async def query_jtt808_vehicle(vin: str) -> dict:
    """查询 JT/T 808 车辆实时状态（通过 xtream-codec REST API）
    
    返回：位置、速度、里程、油量、发动机转速、水温、驾驶员
    """

@tool_registry.tool(name="query_jtt808_location", ...)
async def query_jtt808_location(vin: str) -> dict:
    """查询 JT/T 808 车辆最新位置 + 状态（0x0200 位置汇报）"""

@tool_registry.tool(name="query_jtt808_track", ...)
async def query_jtt808_track(vin: str, start: str, end: str) -> dict:
    """查询 JT/T 808 车辆历史轨迹（0x0200 记录）"""

@tool_registry.tool(name="query_jtt808_driver", ...)
async def query_jtt808_driver(vin: str) -> dict:
    """查询当前驾驶员信息（IC 卡读取）"""

@tool_registry.tool(name="send_jtt808_command", ...)
async def send_jtt808_command(vin: str, command: str, params: dict) -> dict:
    """下发 JT/T 808 指令（0x8103 设置参数 / 0x8201 位置跟踪等）
    高危指令需要审批（复用现有 approver 节点）
    """

@tool_registry.tool(name="query_jtt1078_stream", ...)
async def query_jtt1078_stream(vin: str, channel: int = 1) -> dict:
    """获取 JT/T 1078 实时视频流地址（HLS/FLV URL）"""
```

### 4.3 Agent 扩展

```
现有 Intent                         新增 Intent
───────────                         ───────────
vehicle_query       (GB/T 32960)    vehicle_query     → 自动识别协议类型
fault_diagnosis     (UDS DTC)       jtt808_track      → 轨迹回放
command_dispatch    (远程车控)       jtt808_command    → 商用车指令
ota_management      (OTA 升级)       jtt1078_video     → 视频监控
predictive_maintain (预测维护)       driver_query      → 驾驶员查询
fleet_stats         (车队统计)       fleet_stats       → 混合车队统计
general             (一般问答)       general

新增 Planner 模板:
"查一下京A·D1024 今天的行驶轨迹" 
  → jtt808_track: query_jtt808_track(vin="...")

"京B·F3056 的司机是谁"
  → driver_query: query_jtt808_driver(vin="...")

"看一下京C·E7890 的实时视频"
  → jtt1078_video: query_jtt1078_stream(vin="...", channel=1)
```

### 4.4 数据模型扩展

```python
# backend/app/models/vehicle.py — Vehicle 新增字段
class Vehicle(Base):
    # 现有字段（新能源）
    powertrain_type: str     # "BEV" / "PHEV" / "FCEV"
    battery_capacity_kwh: float
    
    # 新增字段（商用车）
    protocol_type: str = "gb32960"  # "gb32960" | "jtt808" | "jtt1078"
    vehicle_category: str = ""      # "truck" | "bus" | "taxi" | "dangerous_goods"
    fuel_type: str = ""             # "diesel" | "gasoline" | "cng" | "electric"
    driver_name: str = ""           # 当前驾驶员
    driver_ic: str = ""             # 驾驶员 IC 卡号

# VehicleTwin — 扩展字段（商用车）
class VehicleTwin(Base):
    # 新能源字段（现有）
    soc: float; soh: float
    max_cell_temp: float
    
    # 商用车字段（新增）
    fuel_level: float = 0.0        # 油量 %
    fuel_consumption: float = 0.0  # 瞬时油耗 L/100km
    engine_rpm: float = 0.0        # 发动机转速
    coolant_temp: float = 0.0      # 冷却液温度
    oil_pressure: float = 0.0      # 机油压力
    cargo_status: str = ""         # 载货状态: "empty"|"loaded"
    video_channels: int = 0        # 视频通道数
    acc_status: str = "off"        # ACC 状态
```

### 4.5 前端扩展

```
FleetMap
  ├─ 地图标记按协议区分：
  │   蓝色圆点 = GB/T 32960 新能源车
  │   橙色圆点 = JT/T 808 商用车
  │   紫色圆点 = JT/T 1078 视频车
  └─ 筛选器：车型 / 协议类型 / 油量 / 载货状态

VehicleTwin
  ├─ 协议自动识别 → 不同面板
  │   ├─ GB/T 32960: SOC/SOH/电机温度 (现有)
  │   └─ JT/T 808: 油量/油耗/发动机/水温 (新增)
  └─ JT/T 1078: + 视频播放器面板 (新增)

AgentConsole
  ├─ 新增快捷提示: "查看京A·D1024 行驶轨迹"
  └─ ToolCallCard: 显示 jtt808/jtt1078 调用

新增页面: VideoPlayer
  └─ 内嵌 JT/T 1078 实时视频 (HLS/FLV Player)
```

## 五、Rust 扩展机会

xtream-codec 的二进制编解码正是 Rust 的舒适区：

```
当前 xtream-codec (Java)            Rust 替代方案
─────────────────────────          ──────────────────────────
@XtreamField 注解驱动               #[derive(Codec)] proc-macro
JVM 预热与 GC 开销                 零 GC，<1ms 解析延迟
Netty 事件循环                      Tokio async runtime
Spring Boot 启动 ~5s                Binary ~200ms 启动

集成方式:
  Rust Codec Server (MCP stdio/SSE)
    ├─ JT/T 808 消息解析 (50+ 种消息类型)
    ├─ JT/T 1078 流媒体转发
    └─ 通过 MCP 协议暴露给 Python Agent
```

对应 vehix-agent 现有 `rust-services/` 目录：
```
rust-services/
├── command-gateway/     (现有 - 车控安全)
├── uds-parser/          (现有 - UDS 诊断)
├── ota-verifier/        (现有 - OTA 校验)
└── jtt808-codec/         (新增 - JT/T 808 编解码)
    ├── Cargo.toml
    └── src/
        ├── lib.rs        (MCP Server + codec engine)
        ├── codec/
        │   ├── mod.rs
        │   ├── decoder.rs  (0x0200 位置 / 0x0201 查询 等)
        │   └── encoder.rs  (0x8103 设置参数 等)
        └── messages/
            ├── location.rs
            ├── status.rs
            └── command.rs
```

## 六、分阶段实施路线

### Phase 1：最小集成（1 周）
- Docker Compose 加入 xtream-codec 容器
- xtream-codec REST API 代理（`jtt808_mcp.py` 2 个查询工具）
- 前端 FleetMap 展示混合车队
- **产出**：在 FleetMap 看到 GB/T 32960 和 JT/T 808 两类车

### Phase 2：协议深度集成（2 周）
- 完整 MCP 工具集（位置/轨迹/驾驶员/指令下发）
- JT/T 1078 视频流接入（HLS URL 透传）
- 前端 VideoPlayer 页面
- Agent 扩展新 Intent（轨迹回放、驾驶员查询）
- **产出**：能对话查询传统商用车数据

### Phase 3：Rust Codec Sidecar（2 周）
- Rust `jtt808-codec` crate——替代 Java 二进制解析路径
- MCP Server 暴露 JT/T 808 编解码能力
- 性能对比：Java vs Rust codec 吞吐量
- **产出**：Rust 独立解析 JT/T 808 二进制流

### Phase 4：统一车队大脑（1 周）
- 跨协议故障关联（如：同一个车队的 BEV 和柴油车同时温度异常）
- 统一告警分级（GB/T 32960 L0-L3 ↔ JT/T 808 告警标志位）
- OTA 扩展到商用车（T-Box 固件升级）
- **产出**：跨燃料类型、跨协议的智能车队管理

## 七、风险分析

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| JT/T 808 协议版本差异 (V2011 vs V2013 vs V2019) | 部分字段解析失败 | xtream-codec 已支持多版本，MCP 工具封装版本协商 |
| 商用车数据量大（30s 上报 vs NEV 的 10s） | 数据库写入压力 | TelemetryRecord 按协议分流存储，定时聚合 |
| xtream-codec Java 堆内存开销 | 服务器资源竞争 | 限制 JVM 堆大小（-Xmx512m），独立容器 |
| 视频流带宽消耗 | 前端卡顿 | 按需拉流 + HLS 自适应码率 |
| 两个异构数据库（vehix SQLite + xtream PostgreSQL） | 数据一致性问题 | Phase 2 统一迁移到 PostgreSQL |

## 八、关键决策点

| 决策 | 推荐 | 理由 |
|------|------|------|
| 集成方式 | MCP 桥接 | 不改 xtream-codec，MCP 是现有工具标准 |
| 数据库 | 前期分开，Phase 4 统一 PostgreSQL | 降低初期复杂度 |
| 视频支持 | 透传 HLS URL，不自行转码 | 前端直接播放，后端零负担 |
| Rust 介入时机 | Phase 3（编解码器）、Phase 4（告警引擎） | 先跑通流程，后用 Rust 提性能 |
| 混合车队 Agent | 统一 IntentRouter，协议差异对用户透明 | "查京A·D1024" 自动识别是 NEV 还是柴油车 |

---

> **一句话总结**：xtream-codec 作为 MCP Sidecar 接入，Python Agent 通过 REST 调用其数据接口，前端展示混合车队（NEV + 传统商用车）。Rust 在未来可选替换二进制编解码路径。不改 xtream-codec 一行代码，不改 vehix-agent 核心架构。
