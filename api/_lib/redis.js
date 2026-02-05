import { Redis } from '@upstash/redis';
import { Ratelimit } from "@upstash/ratelimit";

export const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});