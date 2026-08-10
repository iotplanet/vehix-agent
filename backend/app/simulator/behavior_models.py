"""Fault injection and vehicle health degradation models.

Models how SOH/mileage affect fault probability, and when specific
DTC scenarios are triggered.
"""

import random
from typing import Optional

from app.simulator.dtc_database import DTC_DATABASE
from app.simulator.uds_stack import UDSSimulator, UDSDTC

# Canonical fault injection scenarios
FAULT_SCENARIOS = [
    {"dtc": "P0A2A", "trigger": "motor_temp_high",     "base_prob": 0.02},
    {"dtc": "P0A80", "trigger": "insulation_low",      "base_prob": 0.01},
    {"dtc": "P0A1F", "trigger": "soc_low",             "base_prob": 0.03},
    {"dtc": "C0040", "trigger": "abs_fault",           "base_prob": 0.015},
    {"dtc": "B1342", "trigger": "hvac_sensor",         "base_prob": 0.02},
    {"dtc": "U0100", "trigger": "ecm_comm_lost",       "base_prob": 0.01},
    {"dtc": "P0A43", "trigger": "mcu_temp_high",       "base_prob": 0.015},
    {"dtc": "P0C73", "trigger": "cooling_degraded",    "base_prob": 0.02},
    {"dtc": "C0045", "trigger": "wheel_speed_sensor",  "base_prob": 0.025},
    {"dtc": "U0293", "trigger": "bms_comm_lost",       "base_prob": 0.01},
    {"dtc": "P0AAC", "trigger": "battery_overtemp",    "base_prob": 0.01},
    {"dtc": "P0A7A", "trigger": "cell_imbalance",      "base_prob": 0.025},
]


class BehaviorModel:
    """Per-vehicle health degradation and fault injection logic."""

    def __init__(self, vin: str, soh: float = 100.0, mileage: float = 0.0):
        self.vin = vin
        self.soh = soh
        self.mileage = mileage

    def should_inject(self, base_prob: float) -> bool:
        """Calculate fault probability adjusted by SOH and mileage."""
        soh_factor = 1.0 + (100.0 - self.soh) / 50.0
        mileage_factor = 1.0 + self.mileage / 200_000.0
        return random.random() < (base_prob * soh_factor * mileage_factor)

    def pick_fault(self) -> Optional[dict]:
        """Pick a random fault scenario based on adjusted probabilities."""
        for scenario in FAULT_SCENARIOS:
            if self.should_inject(scenario["base_prob"]):
                return scenario
        return None

    def inject_into_ecu(self, ecu: UDSSimulator) -> Optional[str]:
        """Inject a random fault into the UDS ECU. Returns DTC code or None."""
        scenario = self.pick_fault()
        if scenario is None:
            return None
        dtc_code = scenario["dtc"]
        if dtc_code in ecu.dtcs:
            return None  # already present — avoid duplicates

        entry = DTC_DATABASE.get(dtc_code)
        if entry is None:
            return None

        from datetime import datetime

        ecu.add_dtc(UDSDTC(
            code=dtc_code,
            status=0x09,
            category=entry.category,
            description=entry.description,
            severity=entry.severity,
            occurred_at=datetime.utcnow(),
            snapshot={
                "vehicle_speed": round(random.uniform(0, 120), 1),
                "soc": round(random.uniform(30, 85), 1),
                "max_cell_temp": round(random.uniform(35, 65), 1),
                "motor_temp": round(random.uniform(60, 170), 1),
                "odometer": round(self.mileage, 0),
                "trigger": scenario["trigger"],
            },
        ))
        return dtc_code

    def degrade(self):
        """Simulate gradual SOH and mileage degradation per cycle."""
        self.soh = max(70.0, self.soh - random.uniform(0, 0.001))
        self.mileage += random.uniform(0, 0.5)
