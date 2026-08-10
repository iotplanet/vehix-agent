"""Intent classification node — LLM with keyword fallback."""

import json
import re

from app.agent.state import VehixAgentState

PLATE_PATTERN = re.compile(
    r"([京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤川青藏琼])"
    r"([A-Z])·?([A-Z0-9]{4,6})"
)


def extract_plate(text: str) -> str | None:
    """Extract Chinese license plate from text (module-level helper)."""
    match = PLATE_PATTERN.search(text)
    return match.group(0) if match else None

INTENT_KEYWORDS = {
    "fault_diagnosis":   ["故障", "诊断", "DTC", "异常", "报警", "温度", "报错", "故障码"],
    "command_dispatch":  ["限功率", "解锁", "锁车", "空调", "断电", "下发", "控制", "远程", "限制", "充电", "关闭", "开门"],
    "ota_management":    ["OTA", "升级", "推送", "版本", "BMS", "固件", "召回"],
    "predictive_maintain": ["保养", "预警", "SOH", "寿命", "预测", "维护"],
    "fleet_stats":       ["统计", "列出", "所有", "多少台", "车队", "汇总", "平均", "在线"],
    "vehicle_query":     ["状态", "孪生", "数据", "遥测", "信息", "详情", "查询", "司机", "轨迹", "视频"],
    # JT/T 808 specific
    "jtt808_track":      ["轨迹", "路线", "行程", "去过"],
    "jtt808_driver":     ["司机", "驾驶员", "开车"],
    "jtt1078_video":     ["视频", "监控", "画面", "摄像头", "实时"],
}

LLM_PROMPT = """你是一个新能源车队运维助手的意图分类器。分析用户消息，返回 JSON：

{
  "intent": "fault_diagnosis|command_dispatch|ota_management|fleet_stats|vehicle_query|general",
  "plate_no": "京A·D1024 或 null",
  "vin": "VIN码 或 null"
}

意图说明：
- fault_diagnosis: 询问故障、诊断、DTC、温度异常
- command_dispatch: 下发车控命令（限功率、解锁、空调、充电等）
- ota_management: OTA升级、固件推送、版本管理
- fleet_stats: 车队统计、列出车辆、汇总信息
- vehicle_query: 查询某台车的状态、遥测数据
- general: 打招呼、帮助、其他

只返回 JSON，不要其他文字。"""


class IntentRouter:
    """Classify user intent — LLM first, keyword fallback."""

    async def __call__(self, state: VehixAgentState) -> dict:
        user_msg = self._get_user_message(state)
        if not user_msg:
            return {"intent": "general", "vin": None}

        intent = "general"
        plate_no = None

        # ── Try LLM ──────────────────────────────────────────
        try:
            from app.agent.llm import llm_invoke
            result = await llm_invoke(user_msg, system=LLM_PROMPT, temperature=0.1)
            if result:
                result = result.strip()
                if result.startswith("```"):
                    result = result.strip("`").replace("json\n", "", 1)
                data = json.loads(result)
                intent = data.get("intent", "general")
                plate_no = data.get("plate_no")
        except Exception:
            pass  # LLM unavailable or parse error → use keywords

        # ── Keyword fallback ─────────────────────────────────
        if intent == "general":
            intent = self._classify_keywords(user_msg)

        # ── Extract plate/VIN ────────────────────────────────
        if not plate_no:
            plate_no = self._extract_plate(user_msg)

        # Resolve plate to VIN
        vin = None
        if plate_no:
            vin = await self._resolve_plate(plate_no)

        return {"intent": intent, "vin": vin}

    # ── Helpers ───────────────────────────────────────────────

    @staticmethod
    def _get_user_message(state: VehixAgentState) -> str:
        for m in reversed(state.get("messages", [])):
            if hasattr(m, "type") and m.type == "human":
                return str(m.content)
        return ""

    @staticmethod
    def _classify_keywords(text: str) -> str:
        text_lower = text.lower()
        for intent, keywords in INTENT_KEYWORDS.items():
            for kw in keywords:
                if kw in text_lower:
                    return intent
        return "general"

    @staticmethod
    def _extract_plate(text: str) -> str | None:
        match = PLATE_PATTERN.search(text)
        return match.group(0) if match else None

    @staticmethod
    async def _resolve_plate(plate: str) -> str | None:
        from app.database import async_session
        from sqlalchemy import select, or_
        from app.models.vehicle import Vehicle

        plate_clean = plate.replace("·", "")
        async with async_session() as db:
            result = await db.execute(
                select(Vehicle.vin).where(
                    or_(Vehicle.plate_no == plate, Vehicle.plate_no == plate_clean)
                )
            )
            vin = result.scalar_one_or_none()
            return vin
