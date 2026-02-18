import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// Shared Redis key constants used across API handlers
export const REDIS_BOARD_CURRENT = 'board:status';
export const REDIS_TURNS_CURRENT = 'rules:status';
export const REDIS_UNDO_STACK = 'undo:stack';
export const UNDO_STACK_MAX = 50;