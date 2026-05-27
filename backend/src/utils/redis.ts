import { Redis } from 'ioredis';
import { logger } from './logger.js';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// Create a Redis client that fails gracefully — Redis is optional for local dev.
// Without Redis the app still works; distributed double-spend locks are just disabled.
export const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: (times) => {
        if (times >= 3) {
            // Stop retrying after 3 attempts; log once and move on.
            return null;
        }
        return Math.min(times * 500, 2000);
    },
});

redis.on('connect', () => {
    logger.info('[Redis] Connected successfully');
});

let _errorLogged = false;
redis.on('error', (err) => {
    if (!_errorLogged) {
        logger.warn('[Redis] Unavailable — running without distributed locks (dev mode)', { error: String(err) });
        _errorLogged = true;
    }
});

// Fire-and-forget connection attempt; never crash the process.
redis.connect().catch(() => { /* handled by error event */ });
