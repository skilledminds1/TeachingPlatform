import { constantTimeEqual } from "@/lib/security/compare";

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
