import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Answer 404 for any API path that matches no real route.
 *
 * WHY THIS FILE EXISTS. Next's not-found handling is page-shaped: for a GET it renders the
 * 404 page and sets the status, but a POST to an unmatched path got the same HTML with a
 * **200**. So a webhook aimed at a typo'd URL — `/api/v1/webhooks/padle`, a stale
 * `/api/v1/webhooks/payfast` after the rail was deleted — was answered "OK, thanks", and the
 * provider stopped retrying because as far as it could tell delivery had succeeded. The
 * notifications were simply gone, and nothing anywhere said so.
 *
 * A catch-all is safe here: Next resolves specific segments before dynamic ones, so every
 * real route still wins. This only ever sees paths that would otherwise have fallen through.
 *
 * Every method is answered explicitly rather than exported from a loop, because the export
 * names are what Next reads at build time.
 */
function notFound(): NextResponse {
  return NextResponse.json(
    { error: "Not Found", message: "No API route matches this path." },
    { status: 404 },
  );
}

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
export const HEAD = notFound;
export const OPTIONS = notFound;
