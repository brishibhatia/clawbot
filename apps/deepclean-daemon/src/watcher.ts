import { watch } from 'chokidar';
import pino from 'pino';
import type { DeepCleanConfig } from '@deepclean/core';

const logger = pino({ name: 'deepclean-watcher' });

export interface WatcherEvents {
    onFileAdded: (filePath: string) => void;
    onFileChanged: (filePath: string) => void;
    onFileRemoved: (filePath: string) => void;
}

export function startWatcher(config: DeepCleanConfig, events: WatcherEvents) {
    const roots = config.roots.map(r => r.replace(/\\/g, '/'));

    logger.info({ roots }, 'Starting file watcher');

    const watcher = watch(roots, {
        ignored: [
            /(^|[/\\])\./,               // dotfiles
            '**/node_modules/**',
            '**/.deepclean-*/**',
        ],
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
            stabilityThreshold: 2000,
            pollInterval: 100,
        },
    });

    watcher
        .on('add', (filePath) => {
            logger.info({ file: filePath }, 'File added');
            events.onFileAdded(filePath);
        })
        .on('change', (filePath) => {
            logger.debug({ file: filePath }, 'File changed');
            events.onFileChanged(filePath);
        })
        .on('unlink', (filePath) => {
            logger.debug({ file: filePath }, 'File removed');
            events.onFileRemoved(filePath);
        })
        .on('error', (err) => {
            logger.error({ err }, 'Watcher error');
        })
        .on('ready', () => {
            logger.info('Watcher ready — monitoring for changes');
        });

    return watcher;
}
