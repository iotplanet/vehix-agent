"""UDS (ISO 14229) protocol stack simulator.

Simulates ECU diagnostic services:
  - 0x19 ReadDTCInformation (subfunctions 0x01–0x04)
  - 0x14 ClearDiagnosticInformation
  - 0x22 ReadDataByIdentifier

Stores DTCs in-memory per VIN. For a production system, this would
be replaced by a Rust parser — see rust-services/uds-parser/.
"""

import copy
import random
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class UDSDTC:
    code: str
    status: int       # UDS DTC status byte (0x09 = active+confirmed)
    category: str     # P / C / B / U
    description: str
    severity: str     # info / warning / critical
    occurred_at: datetime = field(default_factory=datetime.utcnow)
    snapshot: Optional[dict] = None


class UDSSimulator:
    """Simulates a single ECU's UDS diagnostic services."""

    def __init__(self, vin: str):
        self.vin = vin
        self.dtcs: dict[str, UDSDTC] = {}

    # ── 0x19 ReadDTCInformation ──────────────────────────────────

    def service_0x19(self, subfunction: int = 0x02, status_mask: int = 0x09) -> list[UDSDTC]:
        """Simulate UDS 0x19 ReadDTCInformation.

        Args:
            subfunction: 0x01=count, 0x02=list by mask, 0x04=snapshot
            status_mask: 0x09=active, 0x08=history, 0xFF=all
        """
        if status_mask == 0xFF:
            return [copy.deepcopy(d) for d in self.dtcs.values()]
        return [copy.deepcopy(d) for d in self.dtcs.values() if d.status & status_mask]

    def service_0x19_snapshot(self, dtc_code: str) -> Optional[dict]:
        """Simulate UDS 0x19 0x04: read freeze-frame snapshot."""
        dtc = self.dtcs.get(dtc_code.upper())
        if dtc and dtc.snapshot:
            return copy.deepcopy(dtc.snapshot)
        # Generate synthetic snapshot
        return {
            "vehicle_speed": round(random.uniform(0, 120), 1),
            "battery_voltage": round(random.uniform(360, 400), 1),
            "soc": round(random.uniform(40, 90), 1),
            "max_cell_temp": round(random.uniform(30, 60), 1),
            "motor_temp": round(random.uniform(60, 160), 1),
        }

    # ── 0x14 ClearDiagnosticInformation ─────────────────────────

    def service_0x14(self) -> bool:
        """Simulate UDS 0x14: clear all DTCs."""
        self.dtcs.clear()
        return True

    # ── 0x22 ReadDataByIdentifier ───────────────────────────────

    def service_0x22(self, did: int) -> Optional[float]:
        """Simulate UDS 0x22: read data by identifier (DID)."""
        did_map = {
            0xF190: random.uniform(40, 90),    # SOC
            0xF191: random.uniform(90, 100),   # SOH
            0xF192: random.uniform(360, 400),  # Battery voltage
            0xF193: random.uniform(25, 55),    # Max cell temp
            0xF194: random.uniform(30, 160),   # Motor temp
            0xF195: random.uniform(150, 500),  # Insulation resistance
        }
        return did_map.get(did)

    # ── DTC management ──────────────────────────────────────────

    def add_dtc(self, dtc: UDSDTC):
        self.dtcs[dtc.code] = dtc

    def get_active_codes(self) -> list[str]:
        return [c for c, d in self.dtcs.items() if d.status == 0x09]
