import pino from 'pino';
import type { DeepCleanConfig } from '@deepclean/core';

const logger = pino({ name: 'deepclean-scheduler' });

export interface ScheduledTask {
    name: string;
    intervalMs: number;
    execute: () => Promise<void>;
}

export function startScheduler(config: DeepCleanConfig, tasks: ScheduledTask[]) {
    logger.info({ schedule: config.schedule, taskCount: tasks.length }, 'Starting scheduler');

    // Parse simple cron-like interval from config.schedule
    // Default: every 30 minutes
    const intervalMs = parseCronToMs(config.schedule);

    const timers: NodeJS.Timeout[] = [];

    for (const task of tasks) {
        const interval = task.intervalMs || intervalMs;
        logger.info({ task: task.name, intervalMs: interval }, 'Scheduling task');

        const timer = setInterval(async () => {
            logger.info({ task: task.name }, 'Running scheduled task');
            try {
                await task.execute();
                logger.info({ task: task.name }, 'Task completed');
            } catch (err) {
                logger.error({ task: task.name, err }, 'Task failed');
            }
        }, interval);

        timers.push(timer);
    }

    return {
        stop: () => {
            timers.forEach(t => clearInterval(t));
            logger.info('Scheduler stopped');
        },
    };
}

function parseCronToMs(cron: string): number {
    // Simple parser: "*/N * * * *" → every N minutes
    const match = cron.match(/^\*\/(\d+)/);
    if (match) {
        return parseInt(match[1], 10) * 60 * 1000;
    }
    // Default: 30 minutes
    return 30 * 60 * 1000;
}
