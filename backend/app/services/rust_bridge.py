"""Rust safety core bridge — Python fallbacks with Rust upgrade path.

Each function here has a Python fallback implementation. When the
corresponding Rust config flag is enabled and the PyO3 module is
available, the Rust version is used instead.

Config flags (from app.config.settings):
  rust_command_gateway_enabled → command validation
  rust_uds_parser_enabled      → DTC response parsing
  rust_ota_verifier_enabled     → OTA package verification
"""

import hashlib
import time
import re
from typing import Optional

from app.config import settings


# ── Command Gateway ──────────────────────────────────────────────

# Command whitelist (mirrors Rust command-gateway/src/lib.rs)
ALLOWED_COMMANDS = {
    "unlock_door", "start_hvac", "charge_control",
    "limit_power", "clear_dtc", "remote_shutdown",
}
HIGH_RISK_COMMANDS = {"limit_power", "remote_shutdown"}

# Simple nonce store (in-memory — Rust version uses HashSet with pruning)
_used_nonces: set[str] = set()


def validate_command(
    vin: str,
    command: str,
    params: dict,
    signature: Optional[bytes] = None,
    nonce: Optional[str] = None,
    timestamp_ms: Optional[int] = None,
    approval_token: Optional[str] = None,
) -> dict:
    """Validate a vehicle command before dispatch.

    Python fallback: basic whitelist + risk check + nonce replay protection.
    Rust version: constant-time Ed25519 verification + full replay protection.

    Returns: {"valid": bool, "status": "validated"|"rejected"|"pending_approval", "reason": str}
    """
    # When Rust is enabled, try to use it
    if settings.rust_command_gateway_enabled:
        try:
            return _rust_validate_command(vin, command, params, signature, nonce, timestamp_ms, approval_token)
        except Exception:
            pass  # Fall through to Python fallback

    # ── Python fallback ──────────────────────────────────────
    if command not in ALLOWED_COMMANDS:
        return {"valid": False, "status": "rejected", "reason": f"未知命令: {command}"}

    if nonce:
        if nonce in _used_nonces:
            return {"valid": False, "status": "rejected", "reason": "重放攻击检测: nonce 已使用"}
        _used_nonces.add(nonce)
        if len(_used_nonces) > 10000:
            _used_nonces.clear()  # Simple pruning

    if timestamp_ms:
        now_ms = int(time.time() * 1000)
        if abs(now_ms - timestamp_ms) > 300_000:  # 5 minute window
            return {"valid": False, "status": "rejected", "reason": "时间戳已过期"}

    if command in HIGH_RISK_COMMANDS:
        return {"valid": True, "status": "pending_approval", "reason": "高危命令需要审批"}

    return {"valid": True, "status": "validated", "reason": "OK"}


def _rust_validate_command(vin, command, params, signature, nonce, timestamp_ms, approval_token) -> dict:
    """Stub — replaced by PyO3 call when Rust module is compiled."""
    # In production: import command_gateway; return command_gateway.validate(...)
    return validate_command(vin, command, params, signature, nonce, timestamp_ms, approval_token)


# ── UDS Parser ──────────────────────────────────────────────────

# DTC 3-byte code → human-readable mapping
DTC_CATEGORY = {0: "P", 1: "C", 2: "B", 3: "U"}


def parse_dtc_response(raw_bytes: bytes) -> dict:
    """Parse a UDS 0x19 ReadDTCInformation response.

    Python fallback: simple byte parsing.
    Rust version: nom-based zero-copy parser (see rust-services/uds-parser/).

    Wire format: [0x59] [subfunction] [count: u16] [dtc: u24][status: u8]...
    """
    if settings.rust_uds_parser_enabled:
        try:
            return _rust_parse_dtc(raw_bytes)
        except Exception:
            pass

    # ── Python fallback ──────────────────────────────────────
    if len(raw_bytes) < 4 or raw_bytes[0] != 0x59:
        return {"error": "无效的 UDS 响应", "dtcs": []}

    subfunction = raw_bytes[1]
    count = (raw_bytes[2] << 8) | raw_bytes[3]
    dtcs = []
    pos = 4

    for _ in range(min(count, 50)):  # Safety cap
        if pos + 4 > len(raw_bytes):
            break
        code_raw = (raw_bytes[pos] << 16) | (raw_bytes[pos + 1] << 8) | raw_bytes[pos + 2]
        status = raw_bytes[pos + 3]
        dtcs.append({
            "code_raw": code_raw,
            "code": format_dtc_code(code_raw),
            "status": status,
        })
        pos += 4

    return {"subfunction": subfunction, "total_count": count, "dtcs": dtcs}


def format_dtc_code(raw: int) -> str:
    """Convert 3-byte raw DTC to human-readable format (e.g., 0x00A02A00 → 'P0A2A')."""
    category = DTC_CATEGORY.get((raw >> 14) & 0x03, "?")
    first_digit = (raw >> 12) & 0x03
    low_nibbles = raw & 0x0FFF
    return f"{category}{first_digit:01X}{low_nibbles:03X}"


def _rust_parse_dtc(raw_bytes: bytes) -> dict:
    """Stub — replaced by PyO3/uds_parser call."""
    return parse_dtc_response(raw_bytes)


# ── OTA Verifier ────────────────────────────────────────────────


def verify_ota_package(payload: bytes, expected_sha256: str) -> dict:
    """Verify OTA package integrity (SHA-256).

    Python fallback: hashlib.sha256.
    Rust version: SHA-256 + Ed25519 signature verification (see rust-services/ota-verifier/).

    Returns: {"valid": bool, "hash": str, "size": int}
    """
    if settings.rust_ota_verifier_enabled:
        try:
            return _rust_verify_ota(payload, expected_sha256)
        except Exception:
            pass

    # ── Python fallback ──────────────────────────────────────
    actual_hash = hashlib.sha256(payload).hexdigest()
    valid = actual_hash == expected_sha256.lower()
    return {
        "valid": valid,
        "hash": actual_hash,
        "size": len(payload),
        "verified": "sha256_only",  # Rust adds Ed25519 signature check
    }


def compute_gray_release_batches(total: int, first_pct: float = 0.2, second_pct: float = 0.35) -> list[dict]:
    """Compute deterministic gray release batches.

    Mirrors the Rust implementation in ota-verifier/src/lib.rs.
    """
    b1 = max(1, int(total * first_pct))
    b2 = max(1, int(total * second_pct))
    b3 = total - b1 - b2
    batches = [{"batch_no": 1, "size": b1, "status": "active"}]
    if b2 > 0:
        batches.append({"batch_no": 2, "size": b2, "status": "pending"})
    if b3 > 0:
        batches.append({"batch_no": 3, "size": max(0, b3), "status": "pending"})
    return batches


def _rust_verify_ota(payload: bytes, expected_sha256: str) -> dict:
    """Stub — replaced by PyO3/ota_verifier call."""
    return verify_ota_package(payload, expected_sha256)
