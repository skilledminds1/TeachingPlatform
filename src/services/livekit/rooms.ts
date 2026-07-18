import { getLiveKitRoomService, isLiveKitConfigured } from "@/services/livekit/client";

export async function createLiveKitRoom(input: {
  bookingId: string;
  startsAt: Date;
  endsAt: Date;
}): Promise<{ name: string }> {
  const name = `lesson-${input.bookingId.replaceAll("-", "")}`;
  const service = getLiveKitRoomService();
  const existing = await service.listRooms([name]);
  if (existing.length === 0) {
    await service.createRoom({
      name,
      emptyTimeout: Math.max(
        10 * 60,
        Math.ceil((input.endsAt.getTime() - Date.now()) / 1000) + 30 * 60,
      ),
      departureTimeout: 5 * 60,
      maxParticipants: 2,
      metadata: JSON.stringify({
        bookingId: input.bookingId,
        startsAt: input.startsAt.toISOString(),
        endsAt: input.endsAt.toISOString(),
      }),
    });
  }
  return { name };
}

export async function deleteLiveKitRoom(roomName: string): Promise<void> {
  if (!isLiveKitConfigured()) return;
  await getLiveKitRoomService().deleteRoom(roomName).catch(() => undefined);
}
