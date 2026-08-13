"""Tool execution node.

Executes tool calls from the plan against the MCP ToolRegistry.
Features smart parameter filling from user message and previous results,
plus concurrent execution of independent tools (no cross-tool args).
"""

import asyncio
import inspect
import json
import re

from app.agent.state import VehixAgentState
from app.mcp.server import tool_registry

PLATE_PATTERN = re.compile(
    r"([京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤川青藏琼])"
    r"([A-Z])·?([A-Z0-9]{4,6})"
)
VIN_PATTERN = re.compile(r"([A-HJ-NPR-Z0-9]{14,17})")

COMMAND_KEYWORDS: list[tuple[str, str]] = [
    ("解锁", "unlock_door"), ("开门", "unlock_door"),
    ("锁车", "lock_door"), ("上锁", "lock_door"),
    ("空调", "start_hvac"), ("温控", "start_hvac"), ("暖风", "start_hvac"),
    ("充电", "charge_control"),
    ("限功率", "limit_power"), ("限制功率", "limit_power"), ("降低功率", "limit_power"),
    ("清除故障码", "clear_dtc"), ("清故障", "clear_dtc"), ("清除故障", "clear_dtc"),
    ("紧急断电", "remote_shutdown"), ("远程断电", "remote_shutdown"), ("断电", "remote_shutdown"),
    ("鸣笛", "horn"), ("喇叭", "horn"),
    ("闪灯", "flash_lights"), ("双闪", "flash_lights"),
]


class ToolExecutor:
    """Executes tool calls with smart parameter filling."""

    async def __call__(self, state: VehixAgentState) -> dict:
        tool_calls = state.get("tool_calls", [])
        results = list(state.get("tool_results", []))

        if len(results) >= len(tool_calls):
            return {}

        # Execute the next tool sequentially — dependency chains resolve in order
        item, requires_approval, approval_context = await self._execute_tool(
            tool_calls[len(results)], state, results
        )
        results.append(item)

        # ── Parallel fast path ─────────────────────────────────
        # If every remaining tool is independent (no cross-tool args),
        # run them concurrently instead of one LangGraph round-trip each.
        remaining = tool_calls[len(results):]
        if remaining and all(self._is_independent(t) for t in remaining):
            batch = await asyncio.gather(
                *(self._execute_tool(t, state, results) for t in remaining)
            )
            for b_item, b_approval, b_ctx in batch:
                results.append(b_item)
                if b_approval and not requires_approval:
                    requires_approval, approval_context = b_approval, b_ctx

        return {
            "tool_results": results,
            "requires_approval": requires_approval,
            "approval_context": approval_context,
        }

    async def _execute_tool(
        self, next_call: dict, state: VehixAgentState, results: list
    ) -> tuple[dict, bool, dict | None]:
        """Execute a single tool call. Returns (result_item, requires_approval, approval_context)."""
        tool_name = next_call.get("tool", "")
        args = dict(next_call.get("args", {}))
        tool_def = tool_registry.get(tool_name)

        if not tool_def:
            return ({"tool": tool_name, "args": args, "result": {"error": f"未知工具: {tool_name}"}}, False, None)

        param_names = self._get_param_names(tool_def)

        # ── Step 1: Resolve VIN from state / message ─────────────
        vin = state.get("vin")
        if not vin and "vin" in param_names:
            vin = await self._resolve_vin_from_message(state)
            if vin:
                state["vin"] = vin

        if "vin" in param_names and vin:
            args["vin"] = vin

        # ── Step 2: Fill args from previous DTC results ──────────
        if next_call.get("args_from_dtc"):
            for prev in reversed(results):
                if prev.get("tool") == "read_dtc":
                    dtcs = prev.get("result", {}).get("dtcs", [])
                    if dtcs:
                        args["dtc_code"] = dtcs[0].get("dtc_code", "")
                        break
                    else:
                        # No DTCs found — skip this tool gracefully
                        skip_msg = "车辆无活跃故障码，跳过冻结帧读取"
                        return ({"tool": tool_name, "args": args, "result": {"skipped": True, "message": skip_msg}}, False, None)

        # ── Step 3: Smart fill remaining missing params ──────────
        missing = self._smart_fill(tool_name, args, tool_def, state, results)
        if missing:
            return ({"tool": tool_name, "args": args, "result": {"error": missing}}, False, None)

        # ── Step 4: VIN required but not found ───────────────────
        if "vin" in param_names and not args.get("vin"):
            plate = self._extract_plate_from_state(state)
            hint = f" (输入车牌: {plate})" if plate else ""
            return ({"tool": tool_name, "args": args, "result": {
                "error": f"未找到对应车辆{hint}。请确认车牌号正确，或先使用「列出所有在线车辆」查看可用车辆",
            }}, False, None)

        # ── Execute ────────────────────────────────────────────
        result = await tool_registry.call(tool_name, **args)

        requires_approval = result.get("approval_required", False) if isinstance(result, dict) else False
        approval_context = None
        if requires_approval:
            approval_context = {
                "vin": vin or args.get("vin", ""),
                "command": args.get("command", ""),
                "params": {k: v for k, v in args.items() if k not in ("vin", "command")},
                "result": result,
            }

        return ({"tool": tool_name, "args": args, "result": result}, requires_approval, approval_context)

    @staticmethod
    def _is_independent(tool_call: dict) -> bool:
        """True when the tool needs no data from previous tool results."""
        if tool_call.get("args_from_dtc"):
            return False
        return tool_call.get("args_from") in (None, "vin")

    # ── Smart parameter filling ────────────────────────────────

    def _smart_fill(self, tool_name: str, args: dict, tool_def,
                    state: VehixAgentState, prev_results: list) -> str | None:
        """Try to fill missing required params. Returns error string or None if OK."""
        user_msg = self._get_user_message(state)
        param_names = self._get_param_names(tool_def)
        required = self._get_required_params(tool_def)

        for param in required:
            if args.get(param) is not None:
                continue

            value = None

            if param == "vin":
                # Already resolved in __call__ Step 1; if still missing, caught by Step 4
                continue  # skip error — handled by caller

            if param == "dtc_code":
                # Try from user message (e.g., "P0A2A")
                m = re.search(r"\b([BCPU]\d{4})\b", user_msg)
                if m:
                    value = m.group(1)
                else:
                    # Try from previous read_dtc result
                    for prev in reversed(prev_results):
                        if prev.get("tool") == "read_dtc":
                            dtcs = prev.get("result", {}).get("dtcs", [])
                            if dtcs:
                                value = dtcs[0].get("dtc_code", "")
                            break

            elif param == "target_vins":
                for prev in reversed(prev_results):
                    vehicles = prev.get("result", {}).get("vehicles", [])
                    if vehicles:
                        value = json.dumps([v.get("vin", "") for v in vehicles if v.get("vin")], ensure_ascii=False)
                        break

            elif param == "software_version":
                m = re.search(r"(?:v|V)?(\d+\.\d+(?:\.\d+)?)", user_msg)
                if m:
                    prefix = user_msg[max(0, m.start() - 12):m.start()].strip().rstrip("vV").strip()
                    value = f"{prefix} {m.group(1)}".strip() if prefix and len(prefix) < 20 else m.group(1)

            elif param == "command":
                # Strip plate number + whitespace for flexible matching (e.g. "限制...功率" → "限制功率")
                clean_msg = PLATE_PATTERN.sub("", user_msg).replace(" ", "")
                for phrase, cmd in COMMAND_KEYWORDS:
                    if phrase in clean_msg:
                        value = cmd
                        break

            elif param in ("name", "title"):
                clean = re.sub(r"京[A-Z][·\s]?[A-Z0-9]{4,6}", "", user_msg)
                clean = re.sub(r"LSV\w{14}", "", clean).strip()
                value = clean[:80] if clean else None

            elif param == "strategy":
                if "灰度" in user_msg: value = "gray_release"
                elif "分批" in user_msg: value = "batch"
                elif "全量" in user_msg: value = "full"

            elif param == "priority":
                if "紧急" in user_msg or "严重" in user_msg: value = "high"
                elif "高" in user_msg: value = "high"
                elif "中" in user_msg: value = "medium"
                elif "低" in user_msg: value = "low"

            elif param == "metric":
                for kw, m in {"soc":"soc","电量":"soc","soh":"soh","健康":"soh",
                               "温度":"max_cell_temp","电芯":"max_cell_temp",
                               "车速":"speed","速度":"speed","电机":"motor_temp"}.items():
                    if kw in user_msg: value = m; break

            if value is not None:
                args[param] = value
            else:
                return self._missing_hint(param)

        return None

    def _missing_hint(self, param: str) -> str:
        hints = {
            "target_vins": "请指定目标车辆（如：京A·D1024，或先查询「SOH低于90%的车」）",
            "software_version": "请指定软件版本（如：BMS 2.3.1）",
            "command": "请指定命令（如：解锁、空调、充电、限功率、断电）",
            "name": "请指定任务名称",
            "vin": "请指定车辆车牌（如：京A·D1024）",
            "dtc_code": "请指定故障码（如：P0A2A）",
            "strategy": "请指定策略（灰度发布 / 分批发布 / 全量发布）",
            "priority": "请指定优先级（紧急 / 高 / 中 / 低）",
            "metric": "请指定指标（SOC / SOH / 温度 / 速度）",
            "channel": "请指定通道号（1-4）",
        }
        return f"参数不完整 — {hints.get(param, f'缺少参数: {param}')}"

    # ── Helpers ────────────────────────────────────────────────

    async def _resolve_vin_from_message(self, state: VehixAgentState) -> str | None:
        msg = self._get_user_message(state)

        # Try raw VIN first (ISO 3779 format)
        vin_match = VIN_PATTERN.search(msg)
        if vin_match:
            from app.database import async_session
            from sqlalchemy import select
            from app.models.vehicle import Vehicle
            async with async_session() as db:
                result = await db.execute(select(Vehicle.vin).where(Vehicle.vin == vin_match.group(1)))
                if result.scalar_one_or_none():
                    return vin_match.group(1)
                # VIN not in DB but valid format — still use it
                return vin_match.group(1)

        # Try plate number
        plate = self._extract_plate_from_state(state)
        if not plate:
            return None
        from app.database import async_session
        from sqlalchemy import select, or_
        from app.models.vehicle import Vehicle
        plate_clean = plate.replace("·", "")
        async with async_session() as db:
            result = await db.execute(
                select(Vehicle.vin).where(or_(Vehicle.plate_no == plate, Vehicle.plate_no == plate_clean)))
            return result.scalar_one_or_none()

    @staticmethod
    def _get_user_message(state: VehixAgentState) -> str:
        for m in reversed(state.get("messages", [])):
            if hasattr(m, "type") and m.type == "human":
                return str(m.content)
        return ""

    @staticmethod
    def _extract_plate_from_state(state: VehixAgentState) -> str | None:
        msg = ToolExecutor._get_user_message(state)
        return ToolExecutor._extract_plate(msg) if msg else None

    @staticmethod
    def _extract_plate(text: str) -> str | None:
        m = PLATE_PATTERN.search(text)
        return m.group(0) if m else None

    @staticmethod
    def _get_param_names(tool_def) -> set[str]:
        if tool_def and tool_def.fn:
            return set(inspect.signature(tool_def.fn).parameters.keys())
        return set()

    @staticmethod
    def _get_required_params(tool_def) -> set[str]:
        """Return parameter names that have no default value (required)."""
        if tool_def and tool_def.fn:
            return {
                name for name, p in inspect.signature(tool_def.fn).parameters.items()
                if p.default is inspect.Parameter.empty
            }
        return set()
