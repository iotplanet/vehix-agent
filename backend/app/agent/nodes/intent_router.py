"""Intent classification node — keyword rules first, LLM fallback."""

import json
import logging
import re
import time

from app.agent.state import VehixAgentState

logger = logging.getLogger(__name__)

PLATE_PATTERN = re.compile(
    r"([京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤川青藏琼])"
    r"([A-Z])·?([A-Z0-9]{4,6})"
)
VIN_PATTERN = re.compile(r"([A-HJ-NPR-Z0-9]{14,17})")  # VIN: 14-17 chars, excludes I,O,Q


def extract_plate(text: str) -> str | None:
    """Extract Chinese license plate from text (module-level helper)."""
    match = PLATE_PATTERN.search(text)
    return match.group(0) if match else None

INTENT_KEYWORDS = {
    "fault_diagnosis":   ["故障", "诊断", "DTC", "异常", "报警", "温度", "报错", "故障码", "告警", "问题"],
    "command_dispatch":  ["限功率", "解锁", "锁车", "空调", "断电", "下发", "控制", "远程", "限制", "充电", "关闭", "开门",
                          "除霜", "加热", "通风", "鸣笛", "闪灯"],
    "ota_management":    ["OTA", "升级", "推送", "版本", "BMS", "固件", "召回", "更新", "软件"],
    "predictive_maintain": ["保养", "预警", "SOH", "寿命", "预测", "维护", "衰退"],
    "fleet_stats":       ["统计", "列出", "所有", "多少台", "车队", "汇总", "平均", "在线", "离线", "有哪些车", "全部车辆"],
    "vehicle_query":     ["状态", "孪生", "数据", "遥测", "信息", "详情", "查询", "看看", "怎么", "SOC", "电量", "里程",
                          "在哪", "位置", "速度", "胎压"],
    # JT/T 808 specific
    "jtt808_track":      ["轨迹", "路线", "行程", "去过", "去过哪", "轨迹回放"],
    "jtt808_driver":     ["司机", "驾驶员", "开车", "驾驶人"],
    "jtt1078_video":     ["视频", "监控", "画面", "摄像头", "实时"],
}

# ── Follow-up patterns: short queries that imply continuation ──
FOLLOWUP_PATTERNS = [
    r"^(它|这|那|这个|那个|这台|那台|该车|这车)",
    r"^(SOC|SOH|里程|电量|速度|温度|胎压|绝缘|电压|电流)\b",
    r"^(是多少|怎么样|如何|什么|多少|在哪|还有|其他的?|别的关系)",
    r"^(呢|吗\?|吧|啊)",
]

LLM_PROMPT = """你是一个新能源车队运维助手的意图分类器。分析用户消息，返回 JSON：

{
  "intent": "fault_diagnosis|command_dispatch|ota_management|fleet_stats|vehicle_query|general",
  "plate_no": "京A·D1024 或 null",
  "vin": "VIN码 或 null"
}

意图说明：
- fault_diagnosis: 询问故障、诊断、DTC、温度异常、告警
- command_dispatch: 下发车控命令（限功率、解锁、空调、充电等）
- ota_management: OTA升级、固件推送、版本管理
- fleet_stats: 车队统计、列出车辆、汇总信息
- vehicle_query: 查询某台车的状态、SOC、电量、里程、位置等
- general: 打招呼、帮助、模糊问题

重要规则：
1. 如果用户消息是简短的追问（如 "SOC呢？"、"里程多少？"），优先判断为 vehicle_query
2. 如果消息中没有明确的车牌号，plate_no 填 null
3. 只返回 JSON，不要其他文字。"""


class IntentRouter:
    """Classify user intent — keyword rules first, LLM fallback.

    Keyword/regex matching costs <1ms and covers most fleet-ops phrasing.
    The LLM is only consulted when rules don't match, avoiding a full LLM
    round-trip (TTFT + generation) on every request.
    """

    async def __call__(self, state: VehixAgentState) -> dict:
        user_msg = self._get_user_message(state)
        if not user_msg:
            return {"intent": "general", "vin": None}

        intent = "general"
        plate_no = None

        # ── Fast path: keyword rules (no LLM) ────────────────
        intent = self._classify_keywords(user_msg)
        plate_no = self._extract_plate(user_msg)

        # ── LLM fallback: only when rules don't match ─────────
        if intent == "general":
            t0 = time.perf_counter()
            try:
                from app.agent.llm import llm_invoke
                result = await llm_invoke(user_msg, system=LLM_PROMPT, temperature=0.1)
                if result:
                    result = result.strip()
                    if result.startswith("```"):
                        result = result.strip("`").replace("json\n", "", 1)
                    data = json.loads(result)
                    intent = data.get("intent", "general")
                    plate_no = plate_no or data.get("plate_no")
            except Exception:
                pass  # LLM unavailable or parse error → keep keyword result
            logger.info("intent via LLM %.2fs → %s", time.perf_counter() - t0, intent)
        else:
            logger.info("intent via keywords → %s", intent)

        # ── Resolve plate/VIN ────────────────────────────────
        vin = None
        if plate_no:
            vin = await self._resolve_plate(plate_no)
        if not vin:
            # Try raw VIN in user message
            vin = self._extract_vin(user_msg)

        return {"intent": intent, "vin": vin}

    # ── Helpers ───────────────────────────────────────────────

    @staticmethod
    def _get_user_message(state: VehixAgentState) -> str:
        for m in reversed(state.get("messages", [])):
            if hasattr(m, "type") and m.type == "human":
                return str(m.content)
        return ""

    # Metric word + question phrasing → asking about a current value
    # (e.g. "SOH是多少", "充电效率怎么样") — beats the raw keyword table,
    # where "SOH"→predictive_maintain and "充电"→command_dispatch would misfire.
    QUERY_METRICS = ["soc", "soh", "电量", "里程", "温度", "速度", "胎压", "效率",
                     "电压", "电流", "绝缘"]
    QUERY_QUESTIONS = ["多少", "怎么样", "如何", "呢", "吗", "在哪", "什么", "情况", "分析"]

    @classmethod
    def _classify_keywords(cls, text: str) -> str:
        text_lower = text.lower()
        if (any(m in text_lower for m in cls.QUERY_METRICS)
                and any(q in text_lower for q in cls.QUERY_QUESTIONS)):
            return "vehicle_query"
        for intent, keywords in INTENT_KEYWORDS.items():
            for kw in keywords:
                if kw.lower() in text_lower:
                    return intent
        # Bare follow-ups (e.g. "这台呢？", "怎么样？", "SOC？") imply a
        # query about the current vehicle → vehicle_query
        for pattern in FOLLOWUP_PATTERNS:
            if re.search(pattern, text):
                return "vehicle_query"
        return "general"

    @staticmethod
    def _extract_plate(text: str) -> str | None:
        match = PLATE_PATTERN.search(text)
        return match.group(0) if match else None

    @staticmethod
    def _extract_vin(text: str) -> str | None:
        match = VIN_PATTERN.search(text)
        return match.group(1) if match else None

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
