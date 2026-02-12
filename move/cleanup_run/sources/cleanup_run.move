/// CleanupRun — tamper-evident proof record for DeepClean Butler runs.
///
/// Each run produces a proof bundle stored on Walrus. This module anchors
/// a compact on-chain record that binds the Walrus blob ID to the sha256
/// hash of the bundle, making the proof verifiable by anyone.
///
/// The timestamp is derived on-chain via sui::clock::Clock, not supplied
/// by the client, so it cannot be spoofed.
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
        timestamp_ms: u64,       // Unix timestamp in milliseconds (from sui::clock::Clock)
        policy_hash: String,
        plan_hash: String,
        owner: address,
    }

    // ── Event ───────────────────────────────────────────────────
    public struct CleanupRunRecorded has copy, drop {
        run_id: String,
        walrus_blob_id: String,
        bundle_sha256: String,
        timestamp_ms: u64,
        plan_hash: String,
    }

    // ── Entry function — callable from a PTB ────────────────────
    entry fun record_cleanup_run(
        run_id: String,
        walrus_blob_id: String,
        bundle_sha256: String,
        summary: String,
        policy_hash: String,
        plan_hash: String,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let ts = clock::timestamp_ms(clock);

        let record = CleanupRun {
            id: object::new(ctx),
            run_id,
            walrus_blob_id,
            bundle_sha256,
            summary,
            timestamp_ms: ts,
            policy_hash,
            plan_hash,
            owner: ctx.sender(),
        };

        event::emit(CleanupRunRecorded {
            run_id: record.run_id,
            walrus_blob_id: record.walrus_blob_id,
            bundle_sha256: record.bundle_sha256,
            timestamp_ms: ts,
            plan_hash: record.plan_hash,
        });

        transfer::transfer(record, ctx.sender());
    }

    // ── Read accessors ──────────────────────────────────────────
    public fun run_id(self: &CleanupRun): &String { &self.run_id }
    public fun walrus_blob_id(self: &CleanupRun): &String { &self.walrus_blob_id }
    public fun bundle_sha256(self: &CleanupRun): &String { &self.bundle_sha256 }
    public fun summary(self: &CleanupRun): &String { &self.summary }
    public fun timestamp_ms(self: &CleanupRun): u64 { self.timestamp_ms }
    public fun policy_hash(self: &CleanupRun): &String { &self.policy_hash }
    public fun plan_hash(self: &CleanupRun): &String { &self.plan_hash }
}
