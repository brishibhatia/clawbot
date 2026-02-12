// ── Shared Types ──────────────────────────────────────────────

export type FileCategory = 'archive' | 'media' | 'code' | 'document' | 'executable' | 'unknown';

export interface FileInfo {
    path: string;
    relativePath: string;
    size: number;
    mtime: Date;
    sha256: string;
    category: FileCategory;
    suspicious: boolean;
    suspiciousReason?: string;
}

export type ActionType = 'classify' | 'unzip' | 'dedupe' | 'rename' | 'quarantine' | 'skip' | 'report';

export interface PlannedAction {
    id: string;
    type: ActionType;
    sourcePath: string;
    targetPath?: string;
    reason: string;
    fileInfo: FileInfo;
}

export interface ActionResult {
    actionId: string;
    type: ActionType;
    success: boolean;
    sourcePath: string;
    targetPath?: string;
    reason: string;
    error?: string;
    beforeMeta?: { size: number; mtime: string; sha256: string };
    afterMeta?: { size: number; mtime: string; sha256: string };
}

export interface ActionPlan {
    runId: string;
    timestamp: string;
    policyVersion: string;
    policyHash: string;
    rootPath: string;
    dryRun: boolean;
    actions: PlannedAction[];
    fileCount: number;
    planHash: string;
    summary: string;
}

export interface ProofManifest {
    runId: string;
    startTimestamp: string;
    endTimestamp: string;
    policyVersion: string;
    policyHash: string;
    planHash: string;
    environment: {
        os: string;
        nodeVersion: string;
        toolVersions: Record<string, string>;
    };
    plannedActions: PlannedAction[];
    executedActions: ActionResult[];
    fileTreeBefore: string[];
    fileTreeAfter: string[];
    bundleSha256: string;
    summary: string;
}

export interface PolicyConfig {
    version: string;
    rules: {
        neverDelete: boolean;
        maxFileSizeMB: number;
        quarantineDoubleExtensions: boolean;
        quarantineLargeExecutablesMB: number;
        dedupeByContentHash: boolean;
        renameWithDatePrefix: boolean;
        autoUnzipArchives: boolean;
        skipOnBattery: boolean;
        skipPatterns: string[];
    };
}

export interface DeepCleanConfig {
    roots: string[];
    quarantineDir: string;
    stagingDir: string;
    proofsDir: string;
    schedule: string;
    maxCpuPercent: number;
    allowedActions: ActionType[];
    dryRunByDefault: boolean;
}

export interface SealEncryptionResult {
    encryptedData: Buffer;
    encryptionMetadata: {
        algorithm: string;
        keyId: string;
        nonce: string;
        timestamp: string;
    };
}

export interface CleanupRunRecord {
    runId: string;
    walrusBlobId: string;
    bundleSha256: string;
    summary: string;
    timestamp: number;
    policyHash: string;
    suiObjectId?: string;
    txDigest?: string;
}
