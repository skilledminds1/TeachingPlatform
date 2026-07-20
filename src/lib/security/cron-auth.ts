import { timingSafeEqual } from "node:crypto";

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  const length = Math.max(leftBuffer.length, rightBuffer.length, 1);
  const paddedLeft = Buffer.alloc(length);
  const paddedRight = Buffer.alloc(length);
  leftBuffer.copy(paddedLeft);
  rightBuffer.copy(paddedRight);
  return timingSafeEqual(paddedLeft, paddedRight) && leftBuffer.length === rightBuffer.length;
}

export function isAuthorizedBearer(
  authorization: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || !authorization?.startsWith("Bearer ")) return false;
  return constantTimeEqual(authorization.slice(7), secret);
}

export function isCronAuthorized(request: Request): boolean {
  return isAuthorizedBearer(request.headers.get("authorization"), process.env.CRON_SECRET);
}
