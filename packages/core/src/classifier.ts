import path from 'node:path';
import type { FileCategory } from './types.js';

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

export function classifyFile(filePath: string): FileCategory {
    const ext = path.extname(filePath).toLowerCase();
    return EXTENSION_MAP[ext] ?? 'unknown';
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
