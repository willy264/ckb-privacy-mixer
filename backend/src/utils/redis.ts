import { Redis } from 'ioredis';
import { logger } from './logger.js';

// The REDIS_URL will be set in the .env file
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

export const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
});

redis.on('connect', () => {
    logger.info('[Redis] Connected successfully');
});

redis.on('error', (err) => {
    logger.error('[Redis] Connection error', { error: String(err) });
});
