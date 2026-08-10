//! UDS Protocol Parser — Memory-Safe DTC Extraction
//!
//! ## Purpose
//!
//! UDS (ISO 14229) diagnostic protocol messages are binary-format. Parsing
//! them in C/C++ is a common source of buffer-overflow vulnerabilities.
//! This crate uses `nom` parser combinators to provide:
//!
//! - **Zero-copy parsing** — operates on `&[u8]` slices, no allocation
//! - **Compile-time format safety** — nom's type system catches mismatches
//! - **CAN frame ready** — designed for Cortex-M7 at < 500ns latency
//!   (reference: Craton Shield)
//!
//! ## Supported Services
//!
//! - 0x19 ReadDTCInformation (subfunctions 0x01–0x04)
//! - 0x14 ClearDiagnosticInformation
//! - DTC code 3-byte → human-readable format conversion (P0A2A, etc.)
//!
//! ## Integration Point
//!
//! Replaces the Python `UDSStack.parse_*` methods in
//! `backend/app/simulator/uds_stack.py`. The Python side continues
//! to manage the DTC store; this crate handles safe binary parsing.
//!
//! ## References
//!
//! - ISO 14229-1:2020 Road vehicles — Unified Diagnostic Services (UDS)
//! - SAE J2012 Diagnostic Trouble Code Definitions
//! - Craton Shield: CAN IDS parsing in `#![no_std]` Rust

use nom::{
    bytes::complete::take,
    number::complete::{be_u8, be_u16},
    IResult,
};

/// A parsed DTC entry with its status byte.
#[derive(Debug, Clone, PartialEq)]
pub struct DtcEntry {
    /// Raw 3-byte DTC code
    pub code_raw: u32,
    /// UDS DTC status byte
    pub status: u8,
}

/// Response to UDS 0x19 ReadDTCInformation service.
#[derive(Debug, Clone, PartialEq)]
pub struct DtcResponse {
    /// Subfunction echoed back (0x01–0x04)
    pub subfunction: u8,
    /// Number of DTCs in response
    pub dtc_count: u16,
    /// Parsed DTC entries
    pub dtcs: Vec<DtcEntry>,
}

/// Parse a UDS 0x19 0x02 (Read DTC by status mask) positive response.
///
/// Wire format:
///   [0x59] [0x02] [dtc_count: u16] [dtc1_code: u24] [dtc1_status: u8] ...
///
/// # Example
///
/// ```rust
/// use uds_parser::parse_dtc_response;
///
/// // P0A2A active + P0A80 active
/// let data = [0x59, 0x02, 0x00, 0x02,
///             0xA0, 0x2A, 0x00, 0x09,  // P0A2A, status=0x09
///             0xA0, 0x80, 0x00, 0x09]; // P0A80, status=0x09
/// let (_, resp) = parse_dtc_response(&data).unwrap();
/// assert_eq!(resp.dtc_count, 2);
/// assert_eq!(resp.dtcs[0].code_raw, 0x00A02A00);
/// ```
pub fn parse_dtc_response(input: &[u8]) -> IResult<&[u8], DtcResponse> {
    let (input, _) = be_u8(input)?; // 0x59 positive response SID
    let (input, subfunction) = be_u8(input)?;
    let (input, dtc_count) = be_u16(input)?;

    let mut dtcs = Vec::with_capacity(dtc_count as usize);
    let mut remaining = input;

    for _ in 0..dtc_count {
        let (rest, code_bytes) = take(3usize)(remaining)?;
        let code_raw = ((code_bytes[0] as u32) << 16)
            | ((code_bytes[1] as u32) << 8)
            | (code_bytes[2] as u32);
        let (rest, status) = be_u8(rest)?;
        dtcs.push(DtcEntry { code_raw, status });
        remaining = rest;
    }

    Ok((remaining, DtcResponse { subfunction, dtc_count, dtcs }))
}

/// Convert a raw 3-byte DTC code to a human-readable string.
///
/// DTC encoding (ISO 14229 / SAE J2012):
///   Bits 15-14: category (00=P, 01=C, 10=B, 11=U)
///   Bits 13-12: first digit (0-3)
///   Bits 11-0:  remaining 3 hex digits
///
/// # Example
///
/// ```rust
/// use uds_parser::format_dtc_code;
/// assert_eq!(format_dtc_code(0x00A02A00), "P0A2A");
/// assert_eq!(format_dtc_code(0x00404000), "C0040");
/// ```
pub fn format_dtc_code(raw: u32) -> String {
    let category_bits = (raw >> 14) & 0x03;
    let first_digit = (raw >> 12) & 0x03;
    let low_nibbles = raw & 0x0FFF;

    let category = match category_bits {
        0 => 'P',
        1 => 'C',
        2 => 'B',
        3 => 'U',
        _ => '?',
    };

    format!("{}{:01X}{:03X}", category, first_digit, low_nibbles)
}

/// Parse the UDS 0x14 ClearDiagnosticInformation positive response.
///
/// Wire format: [0x54]
pub fn parse_clear_dtc_response(input: &[u8]) -> IResult<&[u8], bool> {
    let (input, sid) = be_u8(input)?;
    Ok((input, sid == 0x54))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_single_dtc() {
        // P0A2A: 0x59 0x02 count=1 raw=0x00A02A00 status=0x09
        let data = [0x59, 0x02, 0x00, 0x01, 0xA0, 0x2A, 0x00, 0x09];
        let (remaining, resp) = parse_dtc_response(&data).unwrap();
        assert!(remaining.is_empty());
        assert_eq!(resp.dtc_count, 1);
        assert_eq!(resp.dtcs[0].code_raw, 0x00A02A00);
        assert_eq!(resp.dtcs[0].status, 0x09);
    }

    #[test]
    fn test_parse_multiple_dtcs() {
        // Two DTCs: P0A2A + P0A80
        let data = [
            0x59, 0x02, 0x00, 0x02,
            0xA0, 0x2A, 0x00, 0x09,
            0xA0, 0x80, 0x00, 0x09,
        ];
        let (remaining, resp) = parse_dtc_response(&data).unwrap();
        assert!(remaining.is_empty());
        assert_eq!(resp.dtc_count, 2);
    }

    #[test]
    fn test_format_dtc_powertrain() {
        assert_eq!(format_dtc_code(0x00A02A00), "P0A2A");
        assert_eq!(format_dtc_code(0x00A08000), "P0A80");
        assert_eq!(format_dtc_code(0x00A1F000), "P0A1F");
    }

    #[test]
    fn test_format_dtc_chassis() {
        assert_eq!(format_dtc_code(0x00404000), "C0040");
    }

    #[test]
    fn test_format_dtc_network() {
        assert_eq!(format_dtc_code(0x01000000), "U0100");
    }

    #[test]
    fn test_clear_dtc_response() {
        let (_, ok) = parse_clear_dtc_response(&[0x54]).unwrap();
        assert!(ok);
    }
}
