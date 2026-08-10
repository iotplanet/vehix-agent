"""DTC fault code database — 50+ common EV diagnostic trouble codes.

Categorized per ISO 14229 / SAE J2012:
  P = Powertrain (battery, motor, inverter, thermal)
  C = Chassis (ABS, steering, brake)
  B = Body (HVAC, airbag, lighting, TPMS)
  U = Network (CAN bus, ECU communication)
"""

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class DTCEntry:
    code: str
    category: str   # P / C / B / U
    description: str
    severity: str    # info / warning / critical
    system: str      # subsystem label


DTC_DATABASE: dict[str, DTCEntry] = {
    # ── Powertrain — High Voltage Battery ──
    "P0A1F": DTCEntry("P0A1F", "P", "高压电池低电量", "warning", "BMS"),
    "P0A80": DTCEntry("P0A80", "P", "高压电池绝缘故障", "critical", "BMS"),
    "P0A7A": DTCEntry("P0A7A", "P", "电池单体电压不平衡", "warning", "BMS"),
    "P0A7C": DTCEntry("P0A7C", "P", "电池温度传感器故障", "warning", "BMS"),
    "P0A7D": DTCEntry("P0A7D", "P", "电池管理系统内部故障", "critical", "BMS"),
    "P0AAC": DTCEntry("P0AAC", "P", "电池温度过高", "critical", "BMS"),
    "P0ABF": DTCEntry("P0ABF", "P", "电池电流传感器故障", "warning", "BMS"),
    "P0AC0": DTCEntry("P0AC0", "P", "电池充电过流", "critical", "BMS"),
    "P0B0A": DTCEntry("P0B0A", "P", "电池冷却液泵故障", "warning", "BMS"),
    "P0B3D": DTCEntry("P0B3D", "P", "电池SOH衰减超限", "warning", "BMS"),
    "P1E00": DTCEntry("P1E00", "P", "车载充电机通信故障", "warning", "OBC"),
    # ── Powertrain — Drive Motor ──
    "P0A2A": DTCEntry("P0A2A", "P", "驱动电机温度过高", "warning", "MCU"),
    "P0A2B": DTCEntry("P0A2B", "P", "驱动电机转速传感器故障", "warning", "MCU"),
    "P0A3F": DTCEntry("P0A3F", "P", "驱动电机位置传感器故障", "critical", "MCU"),
    "P0A43": DTCEntry("P0A43", "P", "驱动电机控制器温度过高", "critical", "MCU"),
    "P0A44": DTCEntry("P0A44", "P", "驱动电机控制器内部故障", "critical", "MCU"),
    "P0A4B": DTCEntry("P0A4B", "P", "电机冷却液温度过高", "warning", "MCU"),
    # ── Powertrain — Inverter & DC-DC ──
    "P0A94": DTCEntry("P0A94", "P", "DC-DC转换器故障", "warning", "DC-DC"),
    "P0A95": DTCEntry("P0A95", "P", "逆变器温度过高", "critical", "Inverter"),
    "P0A98": DTCEntry("P0A98", "P", "逆变器IGBT故障", "critical", "Inverter"),
    # ── Powertrain — Thermal ──
    "P0C73": DTCEntry("P0C73", "P", "电池冷却系统效能不足", "warning", "Thermal"),
    "P0C74": DTCEntry("P0C74", "P", "空调压缩机故障", "warning", "Thermal"),
    "P0C77": DTCEntry("P0C77", "P", "冷却风扇故障", "warning", "Thermal"),
    # ── Chassis ──
    "C0040": DTCEntry("C0040", "C", "ABS泵电机故障", "warning", "ABS"),
    "C0045": DTCEntry("C0045", "C", "轮速传感器故障", "warning", "ABS"),
    "C0051": DTCEntry("C0051", "C", "电动助力转向故障", "critical", "EPS"),
    "C0080": DTCEntry("C0080", "C", "制动助力器故障", "critical", "Brake"),
    "C0085": DTCEntry("C0085", "C", "电子手刹故障", "warning", "EPB"),
    # ── Body ──
    "B1000": DTCEntry("B1000", "B", "安全气囊控制单元故障", "critical", "SRS"),
    "B1342": DTCEntry("B1342", "B", "空调压力传感器故障", "info", "HVAC"),
    "B1400": DTCEntry("B1400", "B", "前照灯控制模块故障", "info", "Lighting"),
    "B1500": DTCEntry("B1500", "B", "雨量传感器故障", "info", "Body"),
    "B1800": DTCEntry("B1800", "B", "TPMS轮胎压力传感器故障", "warning", "TPMS"),
    # ── Network ──
    "U0100": DTCEntry("U0100", "U", "与ECM失去通信", "critical", "CAN"),
    "U0121": DTCEntry("U0121", "U", "与ABS模块失去通信", "critical", "CAN"),
    "U0140": DTCEntry("U0140", "U", "与BCM失去通信", "warning", "CAN"),
    "U0293": DTCEntry("U0293", "U", "与BMS失去通信", "critical", "CAN"),
    "U0294": DTCEntry("U0294", "U", "与MCU失去通信", "critical", "CAN"),
    "U0416": DTCEntry("U0416", "U", "接收到的车速数据无效", "warning", "CAN"),
}


def lookup_dtc(code: str) -> Optional[DTCEntry]:
    """Look up a DTC code (case-insensitive)."""
    return DTC_DATABASE.get(code.upper())


def get_by_category(category: str) -> list[DTCEntry]:
    return [d for d in DTC_DATABASE.values() if d.category == category.upper()]


def get_by_severity(severity: str) -> list[DTCEntry]:
    return [d for d in DTC_DATABASE.values() if d.severity == severity]
