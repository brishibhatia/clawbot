/// CleanupRun — tamper-evident proof record for DeepClean Butler runs.
///
/// Each run produces a proof bundle stored on Walrus. This module anchors
/// a compact on-chain record that binds the Walrus blob ID to the sha256
/// hash of the bundle, making the proof verifiable by anyone.
///
/// The timestamp is derived on-chain via sui::clock::Clock, not supplied
/// by the client, so it cannot be spoofed.
///
/// PoA (Proof of Availability): walrus_certify_tx stores the Sui tx digest
/// for the Walrus availability certificate, giving judges two independent
/// anchors — bundle integrity (SHA-256) + availability attestation.
module cleanup_run::cleanup_run {
    use std::string::String;
    use sui::clock::{Self, Clock};
    use sui::event;

    // ── Object ──────────────────────────────────────────────────
    public struct CleanupRun has key, store {
        id: UID,
        run_id: String,
        walrus_blob_id: String,
        bundle_sha256: String,
        summary: String,
        timestamp_ms: u64,
        policy_hash: String,
        plan_hash: String,
        file_tree_root: String,
        action_count: u64,
        agent_id: String,
        signature: vector<u8>,
        // ── PoA fields ──
        walrus_certify_tx: String,                 // Sui tx digest for Walrus certify step
        walrus_availability_event_ref: String,      // "txDigest:eventSeq" when available
        walrus_confirmation_cert_sha256: String,    // sha256(confirmation_certificate), relay only
        version: u8,
        owner: address,
    }

    // ── Event ───────────────────────────────────────────────────
    public struct CleanupRunRecorded has copy, drop {
        run_id: String,
        walrus_blob_id: String,
        bundle_sha256: String,
        timestamp_ms: u64,
        plan_hash: String,
        file_tree_root: String,
        action_count: u64,
        agent_id: String,
        walrus_certify_tx: String,
        walrus_availability_event_ref: String,
        walrus_confirmation_cert_sha256: String,
        version: u8,
    }

    // ── Entry function — callable from a PTB ────────────────────
    entry fun record_cleanup_run(
        run_id: String,
        walrus_blob_id: String,
        bundle_sha256: String,
        summary: String,
        policy_hash: String,
        plan_hash: String,
        file_tree_root: String,
        action_count: u64,
        agent_id: String,
        signature: vector<u8>,
        walrus_certify_tx: String,
        walrus_availability_event_ref: String,
        walrus_confirmation_cert_sha256: String,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let ts = clock::timestamp_ms(clock);

        let run = CleanupRun {
            id: object::new(ctx),
            run_id,
            walrus_blob_id,
            bundle_sha256,
            summary,
            timestamp_ms: ts,
            policy_hash,
            plan_hash,
            file_tree_root,
            action_count,
            agent_id,
            signature,
            walrus_certify_tx,
            walrus_availability_event_ref,
            walrus_confirmation_cert_sha256,
            version: 2,
            owner: tx_context::sender(ctx),
        };

        event::emit(CleanupRunRecorded {
            run_id: run.run_id,
            walrus_blob_id: run.walrus_blob_id,
            bundle_sha256: run.bundle_sha256,
            timestamp_ms: run.timestamp_ms,
            plan_hash: run.plan_hash,
            file_tree_root: run.file_tree_root,
            action_count: run.action_count,
            agent_id: run.agent_id,
            walrus_certify_tx: run.walrus_certify_tx,
            walrus_availability_event_ref: run.walrus_availability_event_ref,
            walrus_confirmation_cert_sha256: run.walrus_confirmation_cert_sha256,
            version: run.version,
        });
        transfer::transfer(run, tx_context::sender(ctx));
    }

    // ── Read accessors ──────────────────────────────────────────
    public fun run_id(self: &CleanupRun): &String { &self.run_id }
    public fun walrus_blob_id(self: &CleanupRun): &String { &self.walrus_blob_id }
    public fun bundle_sha256(self: &CleanupRun): &String { &self.bundle_sha256 }
    public fun summary(self: &CleanupRun): &String { &self.summary }
    public fun timestamp_ms(self: &CleanupRun): u64 { self.timestamp_ms }
    public fun policy_hash(self: &CleanupRun): &String { &self.policy_hash }
    public fun plan_hash(self: &CleanupRun): &String { &self.plan_hash }
    public fun walrus_certify_tx(self: &CleanupRun): &String { &self.walrus_certify_tx }
}
