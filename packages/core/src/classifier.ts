import path from 'node:path';
import fs from 'node:fs';
import type { FileCategory } from './types.js';
import { SemanticClassifier, SemanticResult } from './semantic-classifier.js';

const EXTENSION_MAP: Record<string, FileCategory> = {
    // Archives
    '.zip': 'archive', '.tar': 'archive', '.gz': 'archive', '.tgz': 'archive',
    '.rar': 'archive', '.7z': 'archive', '.bz2': 'archive', '.xz': 'archive',
    // Media
    '.jpg': 'media', '.jpeg': 'media', '.png': 'media', '.gif': 'media',
    '.bmp': 'media', '.svg': 'media', '.webp': 'media', '.ico': 'media',
    '.mp4': 'media', '.mkv': 'media', '.avi': 'media', '.mov': 'media',
    '.mp3': 'media', '.wav': 'media', '.flac': 'media', '.ogg': 'media',
    // Code
    '.ts': 'code', '.js': 'code', '.tsx': 'code', '.jsx': 'code',
    '.py': 'code', '.rs': 'code', '.go': 'code', '.java': 'code',
    '.c': 'code', '.cpp': 'code', '.h': 'code', '.cs': 'code',
    '.rb': 'code', '.php': 'code', '.swift': 'code', '.kt': 'code',
    '.json': 'code', '.yaml': 'code', '.yml': 'code', '.toml': 'code',
    '.xml': 'code', '.html': 'code', '.css': 'code', '.scss': 'code',
    '.sh': 'code', '.bash': 'code', '.ps1': 'code', '.bat': 'code',
    // Documents
    '.pdf': 'document', '.doc': 'document', '.docx': 'document',
    '.xls': 'document', '.xlsx': 'document', '.ppt': 'document',
    '.pptx': 'document', '.txt': 'document', '.md': 'document',
    '.rtf': 'document', '.csv': 'document', '.odt': 'document',
    // Executables
    '.exe': 'executable', '.msi': 'executable', '.dmg': 'executable',
    '.app': 'executable', '.deb': 'executable', '.rpm': 'executable',
    '.appimage': 'executable',
};

const DOUBLE_EXTENSION_PATTERN = /\.\w+\.(exe|bat|cmd|scr|pif|com|msi|js|vbs|wsf|ps1)$/i;
const TEXT_EXTENSIONS = ['.txt', '.md', '.json', '.yaml', '.yml', '.xml', '.html', '.css', '.js', '.ts', '.py', '.rb', '.sh'];

// Lazy initialization of SemanticClassifier
let semanticClassifier: SemanticClassifier | null = null;

function getSemanticClassifier(): SemanticClassifier | null {
    if (semanticClassifier) return semanticClassifier;
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
        semanticClassifier = new SemanticClassifier(apiKey);
        return semanticClassifier;
    }
    return null;
}

export function classifyFile(filePath: string): FileCategory {
    const ext = path.extname(filePath).toLowerCase();
    return EXTENSION_MAP[ext] ?? 'unknown';
}

export async function classifyFileWithAI(filePath: string): Promise<{ category: string; summary?: string }> {
    const defaultCategory = classifyFile(filePath);

    // Only use AI for text-based files and if we have a key
    const ext = path.extname(filePath).toLowerCase();
    const classifier = getSemanticClassifier();

    if (classifier && TEXT_EXTENSIONS.includes(ext)) {
        try {
            // Read first 2KB
            const buffer = Buffer.alloc(2048);
            const fd = fs.openSync(filePath, 'r');
            const bytesRead = fs.readSync(fd, buffer, 0, 2048, 0);
            fs.closeSync(fd);

            const content = buffer.slice(0, bytesRead).toString('utf-8');
            if (content.trim().length > 10) {
                const result = await classifier.classify(content);
                // Map AI categories back to FileCategory or keep specific specific ones?
                // Let's keep specific ones for the summary/logs, but for core logic we might need to map them.
                // For now, we return the AI category string directly.
                return { category: result.category, summary: result.summary };
            }
        } catch (e) {
            // Fallback
        }
    }

    return { category: defaultCategory };
}

export function isSuspicious(filePath: string, sizeBytes: number, maxExeMB: number = 50): { suspicious: boolean; reason?: string } {
    const name = path.basename(filePath);

    // Check double extensions (e.g., report.pdf.exe)
    if (DOUBLE_EXTENSION_PATTERN.test(name)) {
        return { suspicious: true, reason: `Double extension detected: ${name}` };
    }

    // Check large executables
    const ext = path.extname(filePath).toLowerCase();
    const exeExtensions = ['.exe', '.msi', '.dmg', '.app', '.deb', '.rpm'];
    if (exeExtensions.includes(ext) && sizeBytes > maxExeMB * 1024 * 1024) {
        return { suspicious: true, reason: `Large executable: ${(sizeBytes / 1024 / 1024).toFixed(1)}MB > ${maxExeMB}MB limit` };
    }

    return { suspicious: false };
}

export function shouldSkip(filePath: string, skipPatterns: string[]): boolean {
    const normalized = filePath.replace(/\\/g, '/');
    return skipPatterns.some(pattern => normalized.includes(pattern));
}

