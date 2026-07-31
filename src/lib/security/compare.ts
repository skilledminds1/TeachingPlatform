import { timingSafeEqual } from "node:crypto";

/**
 * Length-safe constant-time string comparison.
 *
 * `timingSafeEqual` throws when the buffers differ in length, so both sides are copied into
 * equal-length buffers and the length equality is folded into the result. Use this for any
 * comparison of a secret, signature, or token against attacker-supplied input.
 */
export function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  const length = Math.max(leftBuffer.length, rightBuffer.length, 1);
  const paddedLeft = Buffer.alloc(length);
  const paddedRight = Buffer.alloc(length);
  leftBuffer.copy(paddedLeft);
  rightBuffer.copy(paddedRight);
  return timingSafeEqual(paddedLeft, paddedRight) && leftBuffer.length === rightBuffer.length;
}
