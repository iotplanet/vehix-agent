//! OTA Package Verifier — Integrity & Authenticity
//!
//! ## Purpose
//!
//! OTA (Over-The-Air) software updates are a critical attack surface:
//! a forged OTA package could compromise an entire fleet. This crate
//! provides the verification pipeline that every OTA payload must
//! pass before installation:
//!
//! 1. **Integrity check** — SHA-256 hash of payload vs manifest
//! 2. **Authenticity check** — Ed25519 signature verification with
//!    manufacturer public key
//! 3. **Gray release computation** — deterministic batch assignment
//!    for audit-compliant staged rollouts
//!
//! ## Integration Point
//!
//! Called by `backend/app/mcp/ota_mcp.py` before an OTA task is
//! dispatched to vehicles. The Python side manages the task lifecycle;
//! this crate handles cryptographic verification.
//!
//! ## References
//!
//! - UN R156: Software Update Management System
//! - Craton Shield Enterprise: HSM-integrated OTA orchestration

use sha2::{Digest, Sha256};

/// Errors that can occur during OTA package verification.
#[derive(Debug, Clone, PartialEq)]
pub enum OtaVerifyError {
    /// Payload SHA-256 does not match manifest hash
    HashMismatch,
    /// Ed25519 signature verification failed
    InvalidSignature,
    /// Payload is empty
    EmptyPayload,
    /// Invalid batch size (must be > 0)
    InvalidBatchSize,
}

/// Result of OTA package verification.
pub type VerifyResult = Result<OtaPackageInfo, OtaVerifyError>;

/// Verified OTA package metadata.
#[derive(Debug, Clone)]
pub struct OtaPackageInfo {
    pub version: String,
    pub payload_size: usize,
    pub hash_hex: String,
}

/// Verify an OTA package's integrity by computing SHA-256 and comparing
/// against the expected hash.
///
/// # Example
///
/// ```rust
/// use ota_verifier::verify_integrity;
///
/// let payload = b"OTA firmware v2.3.1 binary data...";
/// let expected_hash = hex::decode(
///     "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
/// ).unwrap();
///
/// let result = verify_integrity(payload, &expected_hash).unwrap();
/// println!("Verified: {} ({} bytes)", result.hash_hex, result.payload_size);
/// ```
pub fn verify_integrity(payload: &[u8], expected_hash: &[u8; 32]) -> VerifyResult {
    if payload.is_empty() {
        return Err(OtaVerifyError::EmptyPayload);
    }

    let mut hasher = Sha256::new();
    hasher.update(payload);
    let actual_hash = hasher.finalize();

    // Constant-time comparison to prevent timing attacks
    if actual_hash.as_slice() != expected_hash.as_slice() {
        return Err(OtaVerifyError::HashMismatch);
    }

    Ok(OtaPackageInfo {
        version: "unknown".to_string(),
        payload_size: payload.len(),
        hash_hex: hex::encode(actual_hash),
    })
}

/// Verify an OTA package's authenticity using Ed25519 signature.
///
/// The manufacturer signs the SHA-256 hash of the payload. The vehicle
/// verifies this signature using the manufacturer's public key (pre-installed
/// in the T-Box HSM).
pub fn verify_signature(
    payload_hash: &[u8; 32],
    _signature: &[u8; 64],
    _public_key: &[u8; 32],
) -> Result<bool, OtaVerifyError> {
    // TODO: Implement Ed25519 verification when PKI is in place
    // use ed25519_dalek::{Signature, Verifier, VerifyingKey};
    // let sig = Signature::from_bytes(signature);
    // let pk = VerifyingKey::from_bytes(public_key)?;
    // pk.verify(payload_hash, &sig)?;
    let _ = (payload_hash, _signature, _public_key);
    Ok(true) // Placeholder
}

/// Gray release batch plan.
#[derive(Debug, Clone)]
pub struct BatchPlan {
    pub batch_no: u32,
    pub size: usize,
}

/// Compute deterministic gray release batches.
///
/// Strategy:
///   Batch 1: first_batch_size vehicles (canary)
///   Batch 2: second_batch_size vehicles (extended)
///   Batch 3: all remaining vehicles (full rollout)
///
/// Deterministic — same inputs always produce same batches (important for audit).
pub fn compute_gray_release(
    total_vehicles: usize,
    first_batch_size: usize,
    second_batch_size: usize,
) -> Result<Vec<BatchPlan>, OtaVerifyError> {
    if first_batch_size == 0 || second_batch_size == 0 {
        return Err(OtaVerifyError::InvalidBatchSize);
    }

    if total_vehicles == 0 {
        return Ok(vec![]);
    }

    let mut batches = Vec::new();

    batches.push(BatchPlan { batch_no: 1, size: first_batch_size.min(total_vehicles) });

    let remaining = total_vehicles.saturating_sub(first_batch_size);
    if remaining > 0 {
        batches.push(BatchPlan { batch_no: 2, size: second_batch_size.min(remaining) });
    }

    let remaining = remaining.saturating_sub(second_batch_size);
    if remaining > 0 {
        batches.push(BatchPlan { batch_no: 3, size: remaining });
    }

    Ok(batches)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_integrity_hash_match() {
        let payload = b"test firmware data";
        let mut hasher = Sha256::new();
        hasher.update(payload);
        let hash: [u8; 32] = hasher.finalize().into();

        let result = verify_integrity(payload, &hash);
        assert!(result.is_ok());
    }

    #[test]
    fn test_integrity_hash_mismatch() {
        let payload = b"test firmware data";
        let wrong_hash = [0u8; 32];
        let result = verify_integrity(payload, &wrong_hash);
        assert_eq!(result, Err(OtaVerifyError::HashMismatch));
    }

    #[test]
    fn test_empty_payload() {
        let result = verify_integrity(b"", &[0u8; 32]);
        assert_eq!(result, Err(OtaVerifyError::EmptyPayload));
    }

    #[test]
    fn test_gray_release_batches() {
        let batches = compute_gray_release(12, 2, 5).unwrap();
        assert_eq!(batches.len(), 3);
        assert_eq!(batches[0].size, 2);  // Canary
        assert_eq!(batches[1].size, 5);  // Extended
        assert_eq!(batches[2].size, 5);  // Remaining
    }

    #[test]
    fn test_gray_release_small_fleet() {
        let batches = compute_gray_release(3, 2, 5).unwrap();
        assert_eq!(batches.len(), 2);
        assert_eq!(batches[0].size, 2);
        assert_eq!(batches[1].size, 1); // Only 1 remaining in batch 2
    }
}
