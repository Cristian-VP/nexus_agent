import { createClient } from "redis";
import { config } from "./config";

export const redis = createClient({ url: config.redisUrl });

redis.on("error", (error) => {
  console.error("Redis error", error);
});

export async function ensureRedisConnected(): Promise<void> {
  if (!redis.isOpen) {
    await redis.connect();
  }
}

export async function closeRedis(): Promise<void> {
  if (redis.isOpen) {
    await redis.quit();
  }
}