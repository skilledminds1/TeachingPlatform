import { RoomServiceClient } from "livekit-server-sdk";

import { env, requireLiveKitEnv } from "@/lib/env";

function httpUrl(url: string): string {
  return url.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
}

export function getLiveKitRoomService(): RoomServiceClient {
  const { url, apiKey, apiSecret } = requireLiveKitEnv();
  return new RoomServiceClient(httpUrl(url), apiKey, apiSecret);
}

export function isLiveKitConfigured(): boolean {
  return Boolean(env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET);
}
