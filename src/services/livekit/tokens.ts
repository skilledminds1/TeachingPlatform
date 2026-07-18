import { AccessToken } from "livekit-server-sdk";

import { requireLiveKitEnv } from "@/lib/env";

export async function createLiveKitToken(input: {
  roomName: string;
  userId: string;
  userName: string;
  isTeacher: boolean;
  endsAt: Date;
}): Promise<{ serverUrl: string; token: string }> {
  const { url, apiKey, apiSecret } = requireLiveKitEnv();
  const ttl = Math.max(
    5 * 60,
    Math.ceil((input.endsAt.getTime() + 30 * 60_000 - Date.now()) / 1000),
  );
  const accessToken = new AccessToken(apiKey, apiSecret, {
    identity: input.userId,
    name: input.userName,
    ttl,
    metadata: JSON.stringify({ role: input.isTeacher ? "teacher" : "student" }),
  });
  accessToken.addGrant({
    room: input.roomName,
    roomJoin: true,
    roomAdmin: input.isTeacher,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  return { serverUrl: url, token: await accessToken.toJwt() };
}
