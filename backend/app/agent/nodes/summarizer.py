"""Result summarization node — LLM first with streaming, template fallback."""

import asyncio
import json

from langchain_core.runnables import RunnableConfig

from app.agent.state import VehixAgentState

DIAGNOSIS_PROMPT = """你是一个新能源车故障诊断专家。根据以下 DTC 数据、冻结帧、遥测趋势和车辆孪生信息，给出结构化诊断结论。

## 诊断数据
{tool_results}

## 输出格式（严格 JSON，不要其他文字）
{{
  "root_cause": "根因分析（一句话）",
  "confidence": 85,
  "possible_causes": ["可能原因1", "可能原因2"],
  "steps": ["排查步骤1", "排查步骤2"],
  "suggested_parts": ["建议备件1", "建议备件2"]
}}

请输出 JSON："""

SUMMARIZE_PROMPT = """你是一个新能源车队智能运维助手 Vehix Agent。根据工具调用结果生成简洁专业的回复。

回复要求：
1. 使用中文
2. 数据用表格或列表展示
3. 有故障时给出诊断分析和建议
4. 重要：只有工具结果明确标注"approval_required: true"时才提示需要审批。OTA任务、工单创建等不需要审批，直接告知结果即可。

需要审批: {needs_approval}
用户意图: {intent}
工具调用结果:
{tool_results}

请生成回复："""


class ResponseSummarizer:
    """Generate final response — LLM or template."""

    async def __call__(self, state: VehixAgentState, config: RunnableConfig | None = None) -> dict:
        intent = state.get("intent", "general")
        results = state.get("tool_results", [])
        error = state.get("error")

        if error:
            return {"final_response": f"⚠️ 操作未完成: {error}"}

        if not results:
            return {"final_response": self._fallback(intent)}

        # ── Try LLM (streaming preferred) ────────────────────
        try:
            from app.agent.llm import llm_stream, llm_invoke

            formatted = self._format_for_llm(results)

            # Use structured diagnosis prompt for fault_diagnosis intent
            if intent == "fault_diagnosis":
                prompt = DIAGNOSIS_PROMPT.format(
                    tool_results=json.dumps(formatted, ensure_ascii=False, indent=2),
                )
                system_msg = "你是新能源车故障诊断专家。只输出 JSON，不要其他文字。"
            else:
                prompt = SUMMARIZE_PROMPT.format(
                    intent=intent,
                    needs_approval="是 — 请提示用户批准此操作" if state.get("requires_approval") else "否 — 正常告知结果即可，不要提审批",
                    tool_results=json.dumps(formatted, ensure_ascii=False, indent=2),
                )
                system_msg = "你是 Vehix Agent，新能源车队智能运维助手。用中文回复，专业简洁。"

            # Get token queue from config for streaming
            token_queue = None
            if config and hasattr(config, "get"):
                conf = config.get("configurable", {})
                if isinstance(conf, dict):
                    token_queue = conf.get("token_queue")

            # Try streaming first
            stream = await llm_stream(prompt, system=system_msg, temperature=0.3)
            if stream:
                full_response = ""
                async for token in stream:
                    full_response += token
                    if token_queue:
                        token_queue.put_nowait(token)
                if full_response.strip():
                    return {"final_response": self._format_diagnosis(full_response) if intent == "fault_diagnosis" else full_response.strip()}

            # Fallback to non-streaming
            llm_response = await llm_invoke(prompt, system=system_msg, temperature=0.3)
            if llm_response:
                return {"final_response": self._format_diagnosis(llm_response) if intent == "fault_diagnosis" else llm_response.strip()}
        except Exception:
            pass  # LLM unavailable → use templates

        # ── Template fallback ─────────────────────────────────
        parts = []
        for r in results:
            result = r.get("result", {})
            if isinstance(result, dict) and "error" in result:
                parts.append(f"❌ {r['tool']}: {result['error']}")
            else:
                parts.append(self._format_result(r["tool"], result))

        return {"final_response": "\n\n".join(parts)}

    def _format_diagnosis(self, text: str) -> str:
        """Try to parse JSON diagnosis, fall back to raw text."""
        try:
            clean = text.strip()
            if clean.startswith("```"):
                clean = clean.strip("`").replace("json\n", "", 1).replace("json", "", 1)
            data = json.loads(clean)
            return (
                f"## 诊断结论\n\n"
                f"**根因**: {data.get('root_cause', '未知')}\n\n"
                f"**置信度**: {data.get('confidence', '—')}%\n\n"
                f"### 可能原因\n"
                + "".join(f"- {c}\n" for c in data.get("possible_causes", [])) +
                f"\n### 排查步骤\n"
                + "".join(f"{i+1}. {s}\n" for i, s in enumerate(data.get("steps", []))) +
                f"\n### 建议备件\n"
                + "".join(f"- {p}\n" for p in data.get("suggested_parts", []))
            )
        except (json.JSONDecodeError, AttributeError):
            return text.strip()

    def _format_for_llm(self, results: list) -> list:
        """Truncate large tool results for LLM context."""
        formatted = []
        for r in results:
            res = r.get("result", {})
            if isinstance(res, dict):
                res_clean = {}
                for k, v in res.items():
                    if isinstance(v, list) and len(v) > 10:
                        res_clean[k] = v[:10]
                        res_clean[f"{k}_truncated"] = f"...共 {len(v)} 条"
                    elif isinstance(v, str) and len(v) > 500:
                        res_clean[k] = v[:500] + "..."
                    else:
                        res_clean[k] = v
                formatted.append({"tool": r["tool"], "result": res_clean})
            else:
                formatted.append({"tool": r["tool"], "result": str(res)[:500]})
        return formatted

    # ── Template formatters (fallback) ────────────────────────────

    def _format_result(self, tool: str, result: dict) -> str:
        """Format a tool result when LLM is unavailable."""
        fmt = {
            "query_vehicle_twin": self._fmt_twin,
            "read_dtc": self._fmt_dtc,
            "read_dtc_snapshot": self._fmt_snapshot,
            "query_fleet": self._fmt_fleet_table,
            "query_fleet_stats": self._fmt_fleet_stats,
            "query_fleet_by_condition": self._fmt_fleet_table,
            "query_telemetry_history": self._fmt_telemetry,
            "dispatch_vehicle_command": self._fmt_command,
            "create_ota_task": self._fmt_ota,
            "track_ota_task": self._fmt_ota,
        }.get(tool, lambda r: f"📋 **{tool}**\n```json\n{json.dumps(r, ensure_ascii=False, indent=2)}\n```")

        return fmt(result)

    def _fmt_twin(self, r: dict) -> str:
        dtcs = r.get("active_dtcs", [])
        return (
            f"🚗 **车辆孪生状态** — {r.get('plate_no', r.get('vin', '?'))}\n"
            f"```\n"
            f"电量 SOC      {r.get('soc', '?')}%\n"
            f"健康度 SOH    {r.get('soh', '?')}%\n"
            f"车速          {r.get('speed', '?')} km/h\n"
            f"总里程        {r.get('mileage', '?')} km\n"
            f"电池电压      {r.get('battery_voltage', '?')} V\n"
            f"最高电芯温度  {r.get('max_cell_temp', '?')}°C\n"
            f"电机温度      {r.get('motor_temp', '?')}°C\n"
            f"绝缘电阻      {r.get('insulation_resistance', '?')} kΩ\n"
            f"告警等级      {r.get('alarm_level', '?')}/3\n"
            f"活跃故障码    {', '.join(dtcs) if dtcs else '无'}\n"
            f"```"
        )

    def _fmt_dtc(self, r: dict) -> str:
        dtcs = r.get("dtcs", [])
        if not dtcs:
            return "✅ 无故障码，车辆状态正常"
        lines = [f"🔧 **DTC 故障码** — 共 {len(dtcs)} 条\n| 故障码 | 类别 | 描述 | 严重度 | 状态 |\n|--------|------|------|--------|------|"]
        for d in dtcs:
            active = "活跃" if d.get("is_active") else "历史"
            lines.append(f"| `{d.get('dtc_code','?')}` | {d.get('category','?')} | {d.get('description','?')} | {d.get('severity','?')} | {active} |")
        return "\n".join(lines)

    def _fmt_snapshot(self, r: dict) -> str:
        snap = r.get("snapshot", {})
        if not snap:
            return f"📸 冻结帧 `{r.get('dtc_code','?')}`: 无快照数据"
        return f"📸 **冻结帧** `{r.get('dtc_code','?')}`\n```\n" + "\n".join(f"  {k}: {v}" for k, v in snap.items()) + "\n```"

    def _fmt_fleet_table(self, r: dict) -> str:
        vehicles = r.get("vehicles", [])
        if not vehicles:
            return "📋 未找到匹配的车辆"
        lines = [f"📋 **车辆列表** — 共 {len(vehicles)} 台\n| 车牌 | VIN | 车型 | SOC | SOH | 告警 | 状态 |\n|------|-----|------|-----|-----|------|------|"]
        for v in vehicles:
            t = v.get("twin", {}) or {}
            alarm = {0: "✅", 1: "🔵", 2: "🟡", 3: "🔴"}.get(t.get("alarm_level", 0), "?")
            online = "🟢" if v.get("online_status") == "online" else "⚫"
            lines.append(f"| {v.get('plate_no','?')} | `{v.get('vin','?')[:8]}...` | {v.get('oem','?')} {v.get('model','?')} | {t.get('soc','?')}% | {t.get('soh','?')}% | {alarm} | {online} |")
        return "\n".join(lines)

    def _fmt_fleet_stats(self, r: dict) -> str:
        return (
            f"📊 **车队统计**\n```\n"
            f"车辆总数    {r.get('total_vehicles','?')} 台\n"
            f"在线        {r.get('online_vehicles','?')} 台\n"
            f"离线        {r.get('offline_vehicles','?')} 台\n"
            f"平均 SOC    {r.get('avg_soc','?')}%\n"
            f"平均 SOH    {r.get('avg_soh','?')}%\n"
            f"最高告警    L{r.get('max_alarm_level','?')}\n```"
        )

    def _fmt_telemetry(self, r: dict) -> str:
        stats = r.get("stats", {})
        return f"📈 **{r.get('metric','?')}** 遥测 ({r.get('hours','?')}h) — 最低 {stats.get('min','?')} / 最高 {stats.get('max','?')} / 平均 {stats.get('avg','?')}"

    def _fmt_command(self, r: dict) -> str:
        status = r.get("status", "?")
        icon = {"dispatched": "✅", "pending_approval": "⏳ 需要审批", "executed": "✅", "failed": "❌"}.get(status, "📡")
        return f"{icon} **车控命令**: {r.get('description', r.get('command','?'))} — {status}"

    def _fmt_ota(self, r: dict) -> str:
        return f"📡 **OTA 任务**: {r.get('name','?')} v{r.get('software_version','?')} — {r.get('status','?')} — {r.get('completed_count',0)}/{r.get('target_count',0)}"

    def _fallback(self, intent: str) -> str:
        messages = {
            "fleet_stats": "当前车队数据暂不可用，请稍后再试。",
            "fault_diagnosis": "未能完成诊断，请检查 VIN 是否正确。",
            "command_dispatch": "命令未能下发，请确认车辆在线且命令有效。",
            "ota_management": "OTA 任务创建失败。",
            "vehicle_query": "未查询到该车辆信息。",
            "general": "我是 Vehix Agent，可以帮您：\n- 📋 查询车队列表和车辆状态\n- 🔧 诊断车辆故障码\n- 📡 下发远程车控命令\n- 📊 管理 OTA 升级任务\n\n请问需要什么帮助？",
        }
        return messages.get(intent, messages["general"])
