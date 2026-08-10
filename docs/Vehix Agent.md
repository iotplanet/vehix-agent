# Vehix Agent：车联网 Fleet Agent

> 这个项目是一个**面向新能源汽车车队的云端智能运维 Agent**——以 GB/T 32960 数据规范为底座，以 UDS 诊断协议为工具核心，以 MCP 为工具化标准，做出一个"能查询、能诊断、能派单、能下发车控（带审批）"的可运行全栈应用。

参考业界实践：吉利已将 1000 余项车控功能封装为 MCP 标准化接口，证明了"车辆能力原子化 + Agent 编排"的产业可行性；中汽中心修订的 GB/T 32960.1-2025 明确了"车载终端—企业平台—公共平台"三级架构，是新能源汽车远程监管的合规基线。我们的学习项目就在这两个锚点上展开。

## 🎯 项目定位与边界

### 一句话定位
**基于 MCP 工具化 + LangGraph 编排的新能源车队智能运维 Agent**，前端做车队可视化与流式交互，后端做 Agent 编排与车联网协议模拟。

### 明确的边界（避免项目失控）

| 做 | 不做 |
|----|------|
| 云端 Fleet Agent（B 端运维视角） | 车端座舱语音助手（C 端） |
| 新能源汽车（BEV/PHEV） | 燃油车 |
| 基于 GB/T 32960 的遥测与报警 | 真实车载总线对接 |
| 基于 UDS 的 DTC 诊断模拟 | 真实 ECU 刷写 |
| 带审批流的远程车控模拟 | 真实 T-Box 指令下发 |
| MCP 工具化设计 | 私有 API 裸调用 |

### 对标业界方案
- **协议底座**：GB/T 32960.1-2025《电动汽车远程服务与管理系统技术规范》
- **诊断协议**：ISO 14229 UDS / SAE J2012 DTC
- **工具化标准**：MCP（Model Context Protocol）——参考 MCP-CAN 项目的"虚拟化整车通信网络"思路
- **车控能力封装**：参考吉利 MCP+SOA 平台，将车控功能原子化为 MCP 工具
- **OTA 架构**：参考云-管-车三层协同，云端 OTA 管理平台 + 传输通道 + 车载端升级执行

## 🏗 系统架构（三层协同）

```
┌──────────────────────────────────────────────────────────────────┐
│                        Frontend (React + TS)                       │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐   │
│  │ FleetMap    │  │ VehicleDetail│  │  AgentConsole           │   │
│  │ (车队地图)  │  │ (车辆孪生)   │  │  (流式思考+工具调用)   │   │
│  └──────┬──────┘  └──────┬───────┘  └──────────┬──────────────┘   │
│         └────────────────┴──────────┬───────────┘                 │
│                              SSE / WebSocket                      │
├──────────────────────────────────────┼────────────────────────────┤
│                          Backend (FastAPI)                         │
│  ┌──────────────────────────────────▼──────────────────────────┐  │
│  │              Fleet Agent Orchestrator (LangGraph)             │  │
│  │  IntentRouter → Planner → ToolExecutor → Approver → Summarizer│  │
│  │                                                              │  │
│  │  Sub-Agents:                                                 │  │
│  │  ├─ DiagnosisAgent    (UDS DTC 诊断)                         │  │
│  │  ├─ MaintenanceAgent  (预测性维护)                           │  │
│  │  ├─ CommandAgent      (远程车控，需审批)                     │  │
│  │  ├─ OTAAgent          (OTA/召回管理)                         │  │
│  │  └─ FleetAgent         (车队查询与统计)                      │  │
│  └──────────────┬───────────────────────────────────────────────┘ │
│                 │                                                  │
│  ┌──────────────▼──────────────────────────────────────────────┐  │
│  │              MCP Tool Layer (标准化工具)                      │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐  │
│  │  │ Vehicle MCP     │  │ Diagnostics MCP │  │ OTA MCP      │  │
│  │  │ - query_twin    │  │ - read_dtc      │  │ - create_task│  │
│  │  │ - query_telemetry│  │ - clear_dtc     │  │ - track_task │  │
│  │  │ - dispatch_cmd   │  │ - read_snapshot │  │ - rollback   │  │
│  │  └─────────────────┘  └─────────────────┘  └──────────────┘  │
│  └──────────────┬───────────────────────────────────────────────┘ │
│                 │                                                  │
│  ┌──────────────▼──────────────────────────────────────────────┐  │
│  │              Vehicle Simulator (GB/T 32960 + UDS Mock)        │  │
│  │  T-Box Mock → MQTT → 模拟 N 台车的上报与指令响应             │  │
│  └──────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────┤
│  Infra: Redis (会话) · Postgres (车辆/工单) · EMQX (MQTT) ·       │
│  Milvus (RAG, 可选)                                               │
└──────────────────────────────────────────────────────────────────┘
```

## 📁 精简后的项目结构

```
vehix-agent/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── agent/
│   │   │   ├── graph.py                 # LangGraph 状态图
│   │   │   ├── nodes/
│   │   │   │   ├── intent_router.py     # 意图路由
│   │   │   │   ├── planner.py           # 任务规划
│   │   │   │   ├── executor.py          # 工具执行
│   │   │   │   ├── approver.py          # 车控审批门禁
│   │   │   │   └── summarizer.py        # 结果汇总
│   │   │   └── state.py                 # VehixAgentState
│   │   ├── mcp/                         # ★ MCP 工具服务
│   │   │   ├── server.py                # MCP Server (SSE)
│   │   │   ├── vehicle_mcp.py           # 车辆查询/车控工具
│   │   │   ├── diagnostics_mcp.py       # UDS DTC 诊断工具
│   │   │   ├── ota_mcp.py               # OTA 管理工具
│   │   │   └── fleet_mcp.py             # 车队统计工具
│   │   ├── simulator/                   # 车辆模拟器
│   │   │   ├── tboot_mock.py            # T-Box 模拟 (GB/T 32960 上报)
│   │   │   ├── uds_stack.py             # UDS 协议栈模拟
│   │   │   ├── dtc_database.py          # DTC 故障码库
│   │   │   └── behavior_models.py       # 故障注入模型
│   │   ├── models/                      # ORM 模型
│   │   │   ├── vehicle.py               # 车辆元数据
│   │   │   ├── telemetry.py             # GB/T 32960 数据
│   │   │   ├── dtc.py                   # 故障码记录
│   │   │   ├── command.py               # 远程命令与审计
│   │   │   └── ota_task.py              # OTA 任务
│   │   └── api/
│   │       ├── agent.py                 # POST /agent/run (SSE)
│   │       ├── vehicles.py              # 车辆 CRUD
│   │       ├── telemetry.py             # 遥测接口
│   │       └── commands.py              # 车控接口
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── fleet/FleetMap.tsx           # 车队地图
│   │   │   ├── vehicle/
│   │   │   │   ├── VehicleTwin.tsx          # 车辆孪生面板
│   │   │   │   ├── TelemetryCharts.tsx      # 遥测曲线 (ECharts)
│   │   │   │   ├── DTCList.tsx              # DTC 故障码列表
│   │   │   │   └── CommandCenter.tsx        # 远程车控台
│   │   │   ├── agent/
│   │   │   │   ├── AgentConsole.tsx         # Agent 对话
│   │   │   │   ├── ThoughtTimeline.tsx      # 思考链时间线
│   │   │   │   └── ToolCallCard.tsx         # 工具调用卡片
│   │   │   └── ota/OTATaskManager.tsx       # OTA 任务管理
│   │   ├── store/                           # Zustand
│   │   └── hooks/useAgentStream.ts          # SSE 消费
│   └── package.json
│
└── docker-compose.yml
```

## 🚗 核心数据模型（锚定 GB/T 32960.1-2025）

GB/T 32960.1-2025 规定了电动汽车远程服务与管理系统的系统架构，适用于 BEV、PHEV、FCEV 的车载终端、企业平台和公共平台之间的数据通信。2025 版新增了通道加密传输、行驶/充电完成后 1 小时安全监管等要求。我们的数据模型严格对齐：

```python
# backend/app/models/vehicle.py
class Vehicle(Base):
    """车辆元数据 - 对应 GB/T 32960 车载终端注册信息"""
    vin: str                    # 车辆识别码 (VIN)
    plate_no: str               # 车牌号
    oem: str                    # 制造厂
    model: str                  # 车型
    powertrain_type: str        # BEV / PHEV / FCEV
    
    # GB/T 32960 规定的企业平台采集参数
    battery_capacity_kwh: float
    max_speed: float
    online_status: str          # online / offline
    
    # 车辆孪生当前状态
    twin: Relationship["VehicleTwin"]


class VehicleTwin(Base):
    """车辆孪生 - 实时状态快照"""
    vehicle_id: str
    vin: str
    
    # 整车数据 (GB/T 32960 第3部分)
    speed: float                 # 车速 km/h
    mileage: float               # 里程 km
    soc: float                   # 电池荷电状态 %
    soh: float                   # 电池健康度 %
    
    # 动力电池数据
    battery_voltage: float       # 总电压 V
    battery_current: float       # 总电流 A
    max_cell_temp: float         # 最高单体温度 °C
    min_cell_temp: float         # 最低单体温度 °C
    insulation_resistance: float # 绝缘电阻 kΩ
    
    # 驱动电机数据
    motor_speed: float           # 电机转速 rpm
    motor_torque: float          # 电机转矩 N·m
    motor_temp: float            # 电机温度 °C
    
    # 位置与报警
    gps_lng: float
    gps_lat: float
    alarm_level: int             # 0-3 报警等级 (GB/T 32960.3-2025 新增4级报警)
    active_dtcs: list[str]       # 当前活跃故障码
    
    last_report_at: datetime     # 最后上报时间
```

## 🛠 MCP 工具化设计（项目灵魂）

参考 MCP-CAN 项目"虚拟化整车通信网络"的思路，我们将车辆能力封装为 MCP 工具。每个工具都是一个标准的 MCP Tool，可被 LangGraph Agent 调用：

### 1. Vehicle MCP Server

```python
# backend/app/mcp/vehicle_mcp.py
@mcp.tool()
async def query_vehicle_twin(vin: str) -> dict:
    """查询车辆孪生实时状态
    
    Args:
        vin: 车辆识别码
    
    Returns:
        GB/T 32960 定义的整车数据、动力电池数据、驱动电机数据
    """
    twin = await VehicleTwin.query(vin)
    return {
        "vin": vin,
        "soc": twin.soc,
        "soh": twin.soh,
        "speed": twin.speed,
        "max_cell_temp": twin.max_cell_temp,
        "motor_temp": twin.motor_temp,
        "insulation_resistance": twin.insulation_resistance,
        "active_dtcs": twin.active_dtcs,
        "last_report_at": twin.last_report_at.isoformat(),
    }


@mcp.tool()
async def query_telemetry_history(
    vin: str, 
    metric: str, 
    hours: int = 24
) -> list[dict]:
    """查询车辆历史遥测数据 (GB/T 32960)
    
    Args:
        vin: 车辆识别码
        metric: 指标名 (speed/soc/max_cell_temp/motor_temp/...)
        hours: 查询最近 N 小时
    """
    return await Telemetry.query(vin, metric, hours)


@mcp.tool(approval_required=True)  # ★ MCP 工具级审批标记
async def dispatch_vehicle_command(
    vin: str,
    command: str,
    params: dict = {}
) -> dict:
    """远程下发车控命令
    
    命令范围参考吉利 MCP+SOA 平台的车控能力原子化封装：
    - unlock_door: 远程解锁
    - start_hvac: 远程启动空调
    - charge_control: 充电控制
    - limit_power: 限制功率
    - remote_shutdown: 紧急断电 (高危)
    
    Args:
        vin: 车辆识别码
        command: 命令名
        params: 命令参数
    
    安全：参考车联网安全规范，远程控制需多因子认证 +
          细粒度权限管理 + 操作审计与追溯
    """
    # 1. 校验命令合法性
    spec = await VehicleSpec.get(vin)
    if command not in spec.commands:
        raise ValueError(f"未知命令: {command}")
    
    # 2. 高危命令需审批 (由 Agent 的 Approver 节点拦截)
    if spec.commands[command].approval_required:
        return {"status": "pending_approval", "command": command}
    
    # 3. 通过 MQTT 下发到 T-Box 模拟器
    result = await mqtt_bridge.publish(f"vehicles/{vin}/commands", {
        "command": command,
        "params": params,
        "timestamp": datetime.now().isoformat(),
    })
    
    # 4. 记录审计日志
    await AuditLog.record(vin, command, params)
    
    return {"status": "dispatched", "result": result}
```

### 2. Diagnostics MCP Server（UDS 协议模拟）

```python
# backend/app/mcp/diagnostics_mcp.py
@mcp.tool()
async def read_dtc(vin: str, status_mask: int = 0x09) -> list[dict]:
    """读取 DTC 故障码 (UDS 0x19 服务模拟)
    
    对应 UDS ReadDTCInformation 服务：
    - 0x19 0x01: 读取匹配状态的 DTC 总数
    - 0x19 0x02: 读取当前激活 DTC 列表 (status_mask=0x09)
    - 0x19 0x03: 读取历史 DTC 列表 (status_mask=0x08)
    
    DTC 格式：ISO 14229 三字节编码，P/C/B/U 分类
    
    Args:
        vin: 车辆识别码
        status_mask: DTC 状态掩码
            - 0x09: 当前故障 (testFailed + confirmedDTC)
            - 0x08: 历史故障 (confirmedDTC)
            - 0xFF: 所有故障
    """
    ecu = await UDSSimulator.get_ecu(vin)
    # 模拟 UDS 0x19 0x02 请求
    response = ecu.service_0x19(subfunction=0x02, status_mask=status_mask)
    
    return [{
        "dtc": format_dtc_code(dtc.code),  # 如 "P0A2A"
        "status": dtc.status,
        "category": dtc.category,          # P/C/B/U
        "description": DTC_DATABASE.lookup(dtc.code),
        "severity": dtc.severity,
    } for dtc in response.dtcs]


@mcp.tool()
async def read_dtc_snapshot(vin: str, dtc_code: str) -> dict:
    """读取 DTC 冻结帧 (UDS 0x19 0x04 服务模拟)
    
    冻结帧记录故障发生时刻的环境数据：
    车速、电压、温度、里程等
    
    Args:
        vin: 车辆识别码
        dtc_code: 故障码
    """
    ecu = await UDSSimulator.get_ecu(vin)
    snapshot = ecu.service_0x19_snapshot(dtc_code)
    
    return {
        "dtc": dtc_code,
        "snapshot_data": snapshot,  # {车速: 120, 电池电压: 380, ...}
        "captured_at": snapshot.timestamp,
    }


@mcp.tool()
async def clear_dtc(vin: str) -> dict:
    """清除 DTC (UDS 0x14 服务模拟)
    
    注意：实际生产需安全访问解锁 (UDS 0x27 服务)
    """
    ecu = await UDSSimulator.get_ecu(vin)
    result = ecu.service_0x14()
    
    return {"cleared": result.ok}
```

### 3. OTA MCP Server

```python
# backend/app/mcp/ota_mcp.py
@mcp.tool()
async def create_ota_task(
    target_vins: list[str],
    software_version: str,
    strategy: str = "gray_release"  # gray_release / batch / full
) -> dict:
    """创建 OTA 升级任务
    
    参考 OTA 云-管-车架构：
    1. 升级包制作与上传
    2. 任务发布（灰度/分批）
    3. 车端下载与校验
    4. 安装与激活
    5. 回滚机制
    
    Args:
        target_vins: 目标车辆 VIN 列表
        software_version: 目标软件版本
        strategy: 发布策略
    """
    task = await OTATask.create(
        targets=target_vins,
        version=software_version,
        strategy=strategy
    )
    
    # 下发到目标车辆 (MQTT)
    for vin in target_vins:
        await mqtt_bridge.publish(f"vehicles/{vin}/ota", {
            "task_id": task.id,
            "action": "notify_update",
            "version": software_version,
        })
    
    return {
        "task_id": task.id,
        "status": "created",
        "target_count": len(target_vins),
    }
```

## 🧠 LangGraph 编排：多智能体协作

```python
# backend/app/agent/graph.py
class VehixAgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    intent: Literal[
        "vehicle_query",       # 查询车辆状态
        "fault_diagnosis",     # 故障诊断
        "command_dispatch",    # 远程车控
        "ota_management",      # OTA 管理
        "predictive_maintain", # 预测性维护
        "fleet_stats",         # 车队统计
        "general"              # 一般问答
    ]
    vin: str | None
    requires_approval: bool
    approval_context: dict | None
    tool_calls: list[dict]
    tool_results: list[dict]
    final_response: str | None


def build_vehix_graph():
    graph = StateGraph(VehixAgentState)
    
    graph.add_node("router", IntentRouter())
    graph.add_node("planner", TaskPlanner())
    graph.add_node("executor", ToolExecutor())  # 调用 MCP 工具
    graph.add_node("approver", CommandApprover())  # ★ 车控审批
    graph.add_node("observer", ResultObserver())
    graph.add_node("summarizer", ResponseSummarizer())
    
    graph.set_entry_point("router")
    
    # 意图路由
    graph.add_conditional_edges("router", route_by_intent, {
        "vehicle_query": "planner",
        "fault_diagnosis": "planner",
        "command_dispatch": "planner",
        "ota_management": "planner",
        "predictive_maintain": "planner",
        "fleet_stats": "planner",
        "general": "summarizer",
    })
    
    graph.add_edge("planner", "executor")
    
    # ★ 车控审批门禁（车联网安全核心）
    graph.add_conditional_edges("executor", 
        lambda s: "need_approval" if s.get("requires_approval") else "continue",
        {
            "need_approval": "approver",
            "continue": "observer"
        }
    )
    
    graph.add_edge("approver", "observer")
    
    # 多步循环
    graph.add_conditional_edges("observer", should_continue, {
        "continue": "executor",
        "finish": "summarizer"
    })
    
    graph.add_edge("summarizer", END)
    return graph.compile(checkpointer=MemorySaver())
```

**审批门禁实现**（参考车联网安全规范：远程控制采用多因子认证 + 细粒度权限管理 + 操作审计与追溯）：

```python
# backend/app/agent/nodes/approver.py
class CommandApprover:
    async def __call__(self, state: VehixAgentState) -> dict:
        ctx = state["approval_context"]
        
        # 1. 评估风险等级
        risk = assess_command_risk(ctx["command"])
        
        # 2. 生成审批请求推送到前端
        approval_req = {
            "type": "command_approval",
            "vin": ctx["vin"],
            "command": ctx["command"],
            "params": ctx["params"],
            "risk_level": risk,
            "timestamp": datetime.now().isoformat(),
        }
        
        # 3. 通过 SSE 推送到前端，等待用户确认
        user_confirmed = await ApprovalQueue.wait(approval_req)
        
        if not user_confirmed:
            return {"error": "用户拒绝执行", "requires_approval": False}
        
        # 4. 审计日志
        await AuditLog.record_command(
            vin=ctx["vin"],
            command=ctx["command"],
            operator=state["user_id"],
            approved_at=datetime.now()
        )
        
        return {"requires_approval": False}
```

## 🚙 车辆模拟器：让 Demo 真实可跑

```python
# backend/app/simulator/tboot_mock.py
class TBoxMock:
    """模拟车载终端 (GB/T 32960)
    
    2025 版要求：
    - 企业平台与公共平台通道加密传输
    - 行驶完成和充电完成后 1 小时安全监管
    - 数据质量和一致性要求
    """
    
    def __init__(self, vin: str, vehicle_type: str):
        self.vin = vin
        self.vehicle_type = vehicle_type  # BEV/PHEV/FCEV
        self.soc = random.uniform(40, 90)
        self.soh = random.uniform(90, 100)
        self.dtcs = []
        self.online = True
        
    async def run(self):
        """主循环：周期性上报 GB/T 32960 数据 (MQTT)"""
        while True:
            if self.online:
                # 1. 生成遥测
                telemetry = self._generate_telemetry()
                
                # 2. 通过 MQTT 上报到企业平台
                await mqtt_client.publish(
                    f"vehicles/{self.vin}/telemetry",
                    payload=encode_gb32960(telemetry),
                    qos=1
                )
                
                # 3. 故障注入
                if self._should_inject_fault():
                    await self._inject_fault()
                
                # 4. SOC 自然变化
                self.soc -= random.uniform(0.01, 0.05)
            
            await asyncio.sleep(self.report_interval)
    
    def _generate_telemetry(self) -> dict:
        """基于 SOH 和故障状态生成拟真数据"""
        return {
            "speed": max(0, random.gauss(45, 20)),
            "soc": self.soc,
            "soh": self.soh,
            "max_cell_temp": 35 + (100 - self.soh) * 0.3,
            "motor_temp": 60 + (100 - self.soh) * 0.4,
            "insulation_resistance": 200 + random.gauss(0, 20),
            "gps": self._current_position(),
            "alarm_level": self._calc_alarm_level(),
        }
```

**故障注入场景**（基于 UDS DTC 分类）：

| DTC 码 | 分类 | 描述 | 严重度 |
|--------|------|------|--------|
| P0A1F | P | 高压电池低电量 | warning |
| P0A2A | P | 驱动电机温度过高 | warning |
| P0A80 | P | 电池绝缘故障 | critical |
| C0040 | C | ABS 泵故障 | warning |
| B1342 | B | 空调压力传感器 | info |
| U0100 | U | 与 ECM 失去通信 | critical |

## 🔄 典型交互场景

### 场景 1：故障诊断与工单闭环

```
用户: "京A·D1024 报了 P0A2A 故障码，什么情况？"

Agent 思考链:
┌─────────────────────────────────────────────────────────┐
│ 🔍 意图识别: fault_diagnosis                           │
│                                                        │
│ 🔧 read_dtc(vin="京A·D1024", status_mask=0x09)        │
│   → P0A2A: 驱动电机温度过高 (warning)                  │
│   → P0A1F: 高压电池低电量 (warning)                   │
│                                                        │
│ 🔧 read_dtc_snapshot(vin="京A·D1024", dtc="P0A2A")    │
│   → 冻结帧: 车速 120km/h, 电机转速 8500rpm,           │
│     电机温度 158°C (阈值 150°C), 冷却液温度 95°C      │
│                                                        │
│ 🔧 query_vehicle_twin(vin="京A·D1024")                │
│   → SOC: 72%, SOH: 94%, motor_temp: 158°C ⚠️          │
│   → insulation_resistance: 180 kΩ (正常)              │
│                                                        │
│ 🔧 query_telemetry_history(                           │
│     vin="京A·D1024", metric="motor_temp", hours=24)  │
│   → 温度趋势: 95°C → 158°C 持续上升                   │
│   → 与车速相关性: 高速行驶时温度骤升                   │
│                                                        │
│ 💡 诊断结论 (LLM 推理):                                │
│   根因: 驱动电机冷却系统效能不足 (置信度 82%)          │
│   可能原因: 冷却液不足 / 水泵故障 / 散热器堵塞        │
│   排查步骤:                                             │
│   1. 检查冷却液液位与颜色                              │
│   2. 测试水泵流量                                       │
│   3. 检查散热器有无堵塞                                │
│   建议备件: 水泵总成 ×1, 冷却液 5L                    │
│                                                        │
│ 🔧 create_workorder(... )                              │
│   → 工单 WO-2026-0831 已创建                          │
│                                                        │
│ ✅ 响应: "京A·D1024 驱动电机温度过高 (P0A2A)，诊断    │
│   为冷却系统效能不足，置信度 82%。已创建工单           │
│   WO-2026-0831。建议尽快进站检修，行驶中避免持续高速。 │
│   是否远程限制功率至 70%？"                           │
└─────────────────────────────────────────────────────────┘

用户: "限制功率"
Agent: 🔧 dispatch_vehicle_command(
         vin="京A·D1024", 
         command="limit_power", 
         params={"max_power_percent": 70}
       )
       🔒 需要审批 [前端弹窗: 确认限制车辆功率?]
       用户确认 → MQTT 下发 → T-Box 模拟器执行 → 异步反馈
```

### 场景 2：OTA 召回管理

```
用户: "给所有 SOH 低于 90% 的车辆推送 BMS 2.3.1 升级"

Agent:
┌─────────────────────────────────────────────────────────┐
│ 🔍 意图识别: ota_management                             │
│                                                        │
│ 🔧 query_fleet_by_condition(soh_lt=90)                 │
│   → 匹配 12 台车 (京A·D1024, 京B·F3056, ...)          │
│                                                        │
│ 🔧 create_ota_task(                                    │
│     target_vins=[...12 台车],                          │
│     software_version="BMS 2.3.1",                      │
│     strategy="gray_release"  # 灰度发布                 │
│   )                                                    │
│   → OTA 任务 OTA-2026-0315 已创建                     │
│   → 灰度批次: 首批 2 台 → 观察 24h → 第二批 5 台 → 全量 │
│                                                        │
│ ✅ 响应: "已为 12 台 SOH<90% 的车辆创建 BMS 2.3.1 升级 │
│   任务 (OTA-2026-0315)，采用灰度发布策略。首批 2 台     │
│   已通知，24h 无异常后继续推进。升级包已通过 HSM 签名， │
│   车端将进行完整性校验与真实性校验。"                  │
└─────────────────────────────────────────────────────────┘
```

## 📚 分阶段学习路线（5 周完成核心 Demo）

### Week 1：项目骨架 + 数据底座
- FastAPI + LangGraph 搭建 Agent 基础循环
- 实现 GB/T 32960 数据模型（ORM）
- 车辆模拟器：模拟 10 台 BEV 的基础遥测上报
- 前端：车队列表 + 基础对话界面
- **产出**：能看到 10 台车在"动"，能问"列出所有车"

### Week 2：MCP 工具化 + 诊断能力
- 实现 MCP Server（SSE 模式）
- Vehicle MCP：query_vehicle_twin / query_telemetry_history
- Diagnostics MCP：read_dtc / read_dtc_snapshot / clear_dtc
- UDS 协议栈模拟（0x19 服务）
- DTC 故障码库（内置 50+ 常见 DTC）
- 前端：车辆孪生面板 + DTC 列表
- **产出**：能问"京A·D1024 有什么故障"，Agent 调用 read_dtc 返回结构化结果

### Week 3：故障诊断 Agent + 前端可视化
- IntentRouter：意图分类
- Planner：多步诊断规划
- 故障注入模型：让模拟器产生拟真故障
- 前端：ECharts 遥测曲线 + 流式思考时间线
- **产出**：能问"京A·D1024 温度异常怎么办"，Agent 自动编排 read_dtc → read_dtc_snapshot → query_telemetry_history → LLM 诊断

### Week 4：远程车控 + 审批流
- Command MCP：dispatch_vehicle_command（带 approval_required 标记）
- Approver 节点：高危命令拦截
- 前端：CommandCenter + 审批弹窗
- 审计日志
- **产出**：能说"限制京A·D1024 功率至 70%"，触发审批 → 用户确认 → MQTT 下发 → T-Box 响应

### Week 5：OTA 管理 + 项目整合
- OTA MCP：create_ota_task / track_ota_task
- 灰度发布策略模拟
- 前端：OTATaskManager
- 全链路联调 + Docker Compose 一键启动
- **产出**：能说"给所有 SOH<90% 的车推送 BMS 2.3.1"，Agent 创建 OTA 任务并跟踪状态

## 💡 这个项目的学习价值

1. **行业锚点明确**：紧扣 GB/T 32960.1-2025 国标与 UDS 诊断协议，不是玩具项目
2. **架构对标业界**：MCP 工具化参考吉利 MCP+SOA 平台，OTA 参考云-管-车三层架构，车控安全参考多因子认证 + 审计追溯
3. **Agent 深度足够**：LangGraph 多智能体编排、工具循环调用、审批门禁、流式 SSE
4. **前端复杂度适中**：车队地图 + 车辆孪生 + 流式 Agent 控制台 + ECharts 可视化
5. **可运行可演示**：车辆模拟器让 Demo 无需真实车辆，故障注入让诊断场景真实
6. **简历差异化**：区别于 99% 的"ChatGPT 克隆"，展现对车联网 + Agent 工程化的复合理解

## 🚀 快速启动

```bash
# 1. 启动基础设施
docker-compose up -d   # Postgres + Redis + EMQX

# 2. 后端
cd backend
pip install -r requirements.txt
python -m app.main   # 自动加载 DTC 库、启动模拟器

# 3. 前端
cd frontend
npm install && npm run dev

# 4. 访问 http://localhost:5173
```

> 💡 **Demo 数据**：系统启动后自动注册 10 台 BEV 模拟车，故障注入器随机产生 P0A2A、P0A80 等故障。你可以直接对话：
> - "列出所有在线车辆"
> - "京A·D1024 有什么故障？"
> - "诊断京A·D1024 的温度异常"
> - "限制京A·D1024 功率至 70%"（触发审批）
> - "给 SOH 低于 90% 的车推送 BMS 2.3.1"

---

这个规划把车联网 Agent 项目收敛到了**一个清晰的行业场景（新能源汽车车队运维）+ 一套标准的协议底座（GB/T 32960 + UDS）+ 一种主流的工具化方案（MCP）+ 一个有深度的 Agent 编排（LangGraph 多智能体）**。5 周时间可以拿到一个能演示、能讲清楚、有技术深度的完整项目。




# 在 Vehix Agent 中引入 Rust 的推荐角度

Rust 在车联网安全领域的产业势头已经起来了。2024 年 7 月起 UN R155 法规在 UNECE 国家对所有车型强制生效，业界正在把 CAN IDS、SecOC、V2X、UDS 诊断网关等安全关键能力向 `#![no_std]` Rust 技术栈收敛。Craton Shield 这类项目已经证明：Rust 完全可以跑在 Cortex-M7 上做 CAN 帧入侵检测（延迟 < 500ns），且核心库零堆分配。

下面是按**投入产出比**排序的推荐角度。

## 🎯 角度一：把 Rust 用在"安全关键边界"，而非整个项目

核心原则（参考 Craton Shield 的架构哲学）：**Rust 的价值在于内存安全 + 类型安全 + 零成本抽象，最适合处理"内存不安全的解析"和"密码学验证路径"**。Craton 明确指出，ROI 最高的切入点是 CAN 帧处理、诊断载荷处理、OTA 镜像校验这类"触及内存不安全解析"的模块。

映射到你的项目，**Rust 应该承担的角色是"安全边界守护者"**，Python/LangGraph 继续负责 Agent 编排的灵活性：

```
┌─────────────────────────────────────────────────────────┐
│  Python Layer (FastAPI + LangGraph) — 灵活性优先        │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Agent Orchestrator / Intent Router / Planner     │  │
│  │ → 调用 MCP 工具（通过 gRPC/HTTP 与 Rust 交互）    │  │
│  └──────────────────────┬────────────────────────────┘  │
│                         │ gRPC / FFI                     │
├─────────────────────────▼───────────────────────────────┤
│  Rust Layer (高安全边界模块) — 安全性优先              │
│  ┌────────────────┐ ┌────────────────┐ ┌─────────────┐  │
│  │ Command Gateway│ │ UDS Diagnostic  │ │ OTA Verifier│  │
│  │ - 指令签名/HMAC│ │ - DTC 解析      │ │ - 包签名校验│  │
│  │ - nonce 防重放 │ │ - 冻结帧解码    │ │ - 哈希校验  │  │
│  │ - 审批 Token 校验│ │ - UDS 服务分发  │ │ - 回滚校验  │  │
│  └────────────────┘ └────────────────┘ └─────────────┘  │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Audit Log (Tamper-Evident) — 防篡改审计日志       │   │
│  │ 基于 Merkle Tree / Hash Chain 实现                │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**具体分工**：
- **Python 侧**：Agent 意图识别、工具编排、LLM 调用、前端 SSE、业务状态机
- **Rust 侧**：所有"下了错指令就会出事"的安全关键路径

## 🔴 角度二：Rust 承担的三个核心模块（按优先级）

### 1. Command Gateway（远程车控网关）— 最高优先级

这是整个系统安全风险的汇聚点。参考 Craton Shield 的做法，把命令验证路径做成**常量时间（constant-time）**的 Rust 模块：

```rust
// command-gateway/src/lib.rs
use ed25519_dalek::{Signature, Signer, Verifier};
use std::collections::HashSet;

#[derive(Debug, Clone)]
pub struct CommandGateway {
    /// 已使用的 nonce 集合（防重放）
    used_nonces: HashSet<String>,
    /// 审批 Token 公钥
    approval_public_key: ed25519_dalek::VerifyingKey,
    /// 车控命令白名单
    allowed_commands: HashSet<String>,
}

#[derive(Debug)]
pub enum CommandError {
    InvalidSignature,
    ReplayAttack,
    UnknownCommand,
    MissingApproval,
    ExpiredTimestamp,
}

impl CommandGateway {
    pub fn validate_and_dispatch(
        &mut self,
        vin: &str,
        command: &str,
        params: &serde_json::Value,
        signature: &[u8],
        nonce: &str,
        timestamp_ms: u64,
        approval_token: Option<&str>,
    ) -> Result<DispatchResult, CommandError> {
        // 1. 常量时间验证签名（防时序攻击）
        let sig = Signature::from_slice(signature)
            .map_err(|_| CommandError::InvalidSignature)?;
        // ... 验签逻辑
        
        // 2. 防重放：nonce 必须未使用过
        if self.used_nonces.contains(nonce) {
            return Err(CommandError::ReplayAttack);
        }
        
        // 3. 时间戳新鲜度校验（±5 分钟窗口）
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH).unwrap()
            .as_millis() as u64;
        if (now as i64 - timestamp_ms as i64).abs() > 300_000 {
            return Err(CommandError::ExpiredTimestamp);
        }
        
        // 4. 命令白名单校验
        if !self.allowed_commands.contains(command) {
            return Err(CommandError::UnknownCommand);
        }
        
        // 5. 高危命令必须携带有效审批 Token
        if is_high_risk(command) {
            let token = approval_token
                .ok_or(CommandError::MissingApproval)?;
            // 验证审批 Token 签名
            self.verify_approval_token(token)?;
        }
        
        // 6. 记录 nonce（防重放）
        self.used_nonces.insert(nonce.to_string());
        
        Ok(DispatchResult { vin: vin.to_string(), command: command.to_string() })
    }
}
```

**为什么用 Rust 写这里**：
- 密码学验证路径必须是**常量时间**，防止时序侧信道攻击——Rust 的类型系统能在编译期排除很多时序漏洞
- `nonce` 集合的并发访问控制，Rust 的所有权模型天然防数据竞争
- 与 Python 的 FFI 边界清晰：Python 只传参，Rust 返回 `Ok/Err`

**与 Python 的集成方式**：编译为 cdylib，通过 PyO3 暴露为 Python 模块：

```python
# Python 侧调用
import command_gateway_rs

gateway = command_gateway_rs.CommandGateway(public_key_bytes)

try:
    result = gateway.validate_and_dispatch(
        vin="京A·D1024",
        command="limit_power",
        params={"max_power_percent": 70},
        signature=sig_bytes,
        nonce=nonce_str,
        timestamp_ms=int(time.time() * 1000),
        approval_token=approval_token_str,
    )
    # 验证通过，下发 MQTT
except command_gateway_rs.CommandError as e:
    # 拒绝下发，记录安全事件
    logger.warning(f"Command rejected: {e}")
```

### 2. UDS Diagnostic Parser（UDS 诊断协议解析器）

UDS 协议的报文解析是典型的"内存不安全解析"场景——Craton 明确指出这类**诊断载荷处理**是 ROI 最高的 Rust 切入点。

```rust
// uds-parser/src/lib.rs
// 用 nom (零拷贝解析器组合子库) 解析 UDS 报文
use nom::{
    bytes::complete::take,
    number::complete::{be_u8, be_u16, be_u32},
    IResult,
};

/// UDS 0x19 服务响应：读取 DTC 列表
#[derive(Debug, PartialEq)]
pub struct DtcResponse {
    pub subfunction: u8,
    pub dtc_count: u16,
    pub dtcs: Vec<DtcEntry>,
}

#[derive(Debug, PartialEq)]
pub struct DtcEntry {
    pub dtc_code: u32,        // 三字节 DTC 码
    pub status: u8,           // DTC 状态字节
}

/// 解析 UDS 0x19 0x02 响应报文
/// 报文格式: [0x59][0x02][dtc_count: u16][dtc1: u32][status1: u8][dtc2: u32][status2: u8]...
pub fn parse_dtc_response(input: &[u8]) -> IResult<&[u8], DtcResponse> {
    let (input, _) = be_u8(input)?;  // 0x59 (肯定响应)
    let (input, subfunction) = be_u8(input)?;
    let (input, dtc_count) = be_u16(input)?;
    
    let mut dtcs = Vec::with_capacity(dtc_count as usize);
    let mut remaining = input;
    
    for _ in 0..dtc_count {
        let (rest, dtc_code_bytes) = take(3usize)(remaining)?;
        let dtc_code = ((dtc_code_bytes[0] as u32) << 16) 
                    | ((dtc_code_bytes[1] as u32) << 8) 
                    | (dtc_code_bytes[2] as u32);
        let (rest, status) = be_u8(rest)?;
        dtcs.push(DtcEntry { dtc_code, status });
        remaining = rest;
    }
    
    Ok((remaining, DtcResponse { subfunction, dtc_count, dtcs }))
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_parse_single_dtc() {
        // 0x59 0x02 0x0001 (count=1) 0xA0 0x2A 0x00 (DTC=P0A2A) 0x09 (status)
        let data = [0x59, 0x02, 0x00, 0x01, 0xA0, 0x2A, 0x00, 0x09];
        let (_, resp) = parse_dtc_response(&data).unwrap();
        assert_eq!(resp.dtc_count, 1);
        assert_eq!(resp.dtcs[0].dtc_code, 0x00A02A00); // P0A2A
        assert_eq!(resp.dtcs[0].status, 0x09);
    }
}
```

**为什么用 Rust 写这里**：
- `nom` 解析器组合子天然防缓冲区溢出——这是 C/C++ UDS 实现最常见的漏洞
- 零拷贝解析，性能极高（CAN 帧处理在 Cortex-M7 上 < 500ns）
- 编译期保证报文格式正确，LLM 拿到的 DTC 数据绝不会是"脏数据"
- 类型安全的 DTC 枚举，杜绝 Python 中 `dtc_code: str` 这种弱类型隐患

### 3. OTA Package Verifier（OTA 包校验器）

参考 Craton Shield Shield Enterprise 的 HSM 集成与 OTA 编排能力：

```rust
// ota-verifier/src/lib.rs
use sha2::{Sha256, Digest};
use ed25519_dalek::Verifier;

pub struct OtaPackage {
    pub version: String,
    pub payload_hash: [u8; 32],
    pub signature: Vec<u8>,
    pub manufacturer_pubkey: ed25519_dalek::VerifyingKey,
}

impl OtaPackage {
    /// 校验 OTA 包的完整性与真实性
    /// 1. 计算 payload 的 SHA-256
    /// 2. 比对 manifest 中声明的 hash
    /// 3. 用厂商公钥验证签名
    pub fn verify(&self, payload: &[u8]) -> Result<(), OtaVerifyError> {
        // 1. 完整性校验
        let mut hasher = Sha256::new();
        hasher.update(payload);
        let actual_hash = hasher.finalize();
        if actual_hash.as_slice() != self.payload_hash.as_slice() {
            return Err(OtaVerifyError::HashMismatch);
        }
        
        // 2. 真实性校验（防伪造 OTA 包）
        let sig = ed25519_dalek::Signature::from_slice(&self.signature)
            .map_err(|_| OtaVerifyError::InvalidSignature)?;
        self.manufacturer_pubkey
            .verify(payload, &sig)
            .map_err(|_| OtaVerifyError::InvalidSignature)?;
        
        Ok(())
    }
    
    /// 灰度发布策略的 Rust 实现（确定性、可审计）
    pub fn compute_gray_release_batches(
        &self,
        total_vehicles: usize,
        first_batch_size: usize,
        second_batch_size: usize,
    ) -> Vec<BatchPlan> {
        // 确定性算法，保证每次计算结果一致（重要用于审计）
        let mut batches = Vec::new();
        batches.push(BatchPlan { batch_no: 1, size: first_batch_size });
        batches.push(BatchPlan { batch_no: 2, size: second_batch_size });
        
        let remaining = total_vehicles.saturating_sub(first_batch_size + second_batch_size);
        if remaining > 0 {
            batches.push(BatchPlan { batch_no: 3, size: remaining });
        }
        batches
    }
}
```

## 🟡 角度三：渐进式引入路线（避免项目重写）

Craton 在文章中明确给出了**增量路径**：对于已经在 C++ 中的项目，用 FFI 边界的 Rust 模块承载新服务，存量代码继续运行。你的项目也一样——**不要试图用 Rust 重写整个后端**，而是按以下顺序渐进引入：

### Phase 1：Rust 作为独立二进制（MCP Server）
把 Rust 模块编译成独立的 MCP Server（通过 stdio/SSE 与 Python 通信）：
```
backend/
├── rust-services/              # 新增
│   ├── command-gateway/        # Cargo 项目
│   │   ├── Cargo.toml
│   │   └── src/main.rs         # 实现 MCP Server 协议
│   ├── uds-parser/             # Cargo 项目
│   │   └── src/lib.rs
│   └── ota-verifier/
│       └── src/lib.rs
├── app/
│   └── mcp/
│       ├── command_mcp.py      # 调用 Rust MCP Server
│       ├── diagnostics_mcp.py  # 调用 Rust MCP Server
│       └── ota_mcp.py          # 调用 Rust MCP Server
```

Python 侧通过 MCP 协议调用 Rust 服务，**零 FFI 复杂度**，且 Rust 模块的崩溃不会影响 Python 主进程。

### Phase 2：Rust 编译为 PyO3 模块（性能敏感路径）
当 Command Gateway 的调用频率变高，MCP 协议的 JSON-RPC 开销成为瓶颈时，用 PyO3 编译为原生 Python 模块：

```toml
# Cargo.toml
[lib]
name = "vehix_security"
crate-type = ["cdylib"]

[dependencies]
pyo3 = { version = "0.22", features = ["extension-module"] }
```

### Phase 3：Rust 实现 `#![no_std]` 内核（未来车端部署）
如果未来要把 Agent 能力下沉到车端 T-Box（参考 Craton Shield 的 `#![no_std]` 路径），Rust 代码的 `#![no_std]` 版本可以直接编译到 Cortex-M / RISC-V：
- 零堆分配（`heapless::Vec` 替代 `std::Vec`）
- 静态边界数据结构（编译期确定所有 buffer 大小）
- 常量时间密码学操作

这一层对未来"云端 Agent + 车端 Rust 安全核"的架构演进至关重要。

## 🟢 角度四：未来可扩展性设计

Rust 引入的真正价值不仅是"现在更安全"，更是"未来可下沉"：

| 阶段 | 部署位置 | Rust 模块形态 | 与 Agent 的关系 |
|------|---------|--------------|----------------|
| Phase 1 (学习项目) | 云端独立进程 | MCP Server (stdio/SSE) | Python Agent 通过 MCP 调用 |
| Phase 2 (预生产) | 云端 Sidecar | PyO3 原生模块 | 零拷贝调用，微秒级延迟 |
| Phase 3 (车端部署) | T-Box / Edge | `#![no_std]` 静态链接库 | Agent 通过车载以太网调用 SecOC 认证的 RPC |

参考 Craton Shield 的认证复用哲学：**Shield Core 一次实现，ISO 26262 和 IEC 62443 共用同一套认证证据**。你的 Rust 安全核心也可以一次编写，云端/车端复用——这才是"未来可扩展性"的真正含义。

## 📋 具体建议：从哪里开始

**不要一上来就写三个 Rust 模块**。推荐顺序：

1. **Week 3-4 引入 Rust Command Gateway**（最高 ROI）
   - 用 PyO3 封装为 Python 模块
   - 替代原 Python 版的 `dispatch_vehicle_command` 审批逻辑
   - 在简历上写："使用 Rust 实现远程车控指令的签名验证、防重放、审批 Token 校验，通过 PyO3 与 Python Agent 集成"

2. **Week 5 引入 Rust UDS Parser**
   - 用 `nom` 解析 UDS 0x19 响应
   - 编译为独立 MCP Server
   - 在简历上写："基于 nom 零拷贝解析器实现 UDS 诊断协议解析，编译期保证报文格式安全"

3. **（可选）Rust OTA Verifier**
   - 如果时间允许，实现 OTA 包的 Ed25519 签名校验
   - 在简历上写："实现 OTA 包完整性校验与厂商签名验证，防伪造 OTA 攻击"

## ⚠️ 几个反模式（不要用 Rust 做什么）

- **不要用 Rust 写 Agent 编排**：LangGraph 的生态、LLM 集成的灵活性在 Python 侧更好，强行用 Rust 写 Agent 是舍本逐末
- **不要用 Rust 写前端 API 层**：FastAPI 的开发效率远超 Rust 的 axum/actix-web，且这一层不涉及内存不安全解析
- **不要为了"全栈 Rust"而 Rust**：Rust 的编译时间、学习曲线都不容忽视，学习项目的时间是有限的
- **不要在模拟器里用 Rust**：车辆模拟器主要是数值计算 + MQTT 发布，Python 完全够用，用 Rust 反而拖慢迭代

> 💡 **一句话定位**：Rust 在你的项目里是"安全核"而非"全能手"。它守住 Command Gateway、UDS Parser、OTA Verifier 这三个安全关键边界，让 Python Agent 可以放心地灵活编排——这才是 Rust + Python 在车联网 Agent 项目中的最佳分工。

这样的架构既体现了你对车联网安全的深度理解（参考 UN R155 / Craton Shield 的产业实践），又保持了学习项目的敏捷性，同时为未来"云端 Agent + 车端 Rust 安全核"的真实部署埋下了演进路径。在车企面试官眼里，这比"纯 Python 玩具项目"或"硬上全栈 Rust 但写不出业务"都有说服力得多。