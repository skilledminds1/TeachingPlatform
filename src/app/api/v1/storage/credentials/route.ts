import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isUuid, recordAdminAccess } from "@/server/admin/audit";

export async function GET(request: Request) {
  const path = new URL(request.url).searchParams.get("path");
  if (!path || path.includes("..")) {
    return NextResponse.json({ error: "Invalid credential path" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const record = await db.user.findUnique({
    where: { id: user.id },
    select: { isPlatformAdmin: true },
  });

  const isOwner = path.startsWith(`${user.id}/`);
  if (!record?.isPlatformAdmin && !isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await createAdminClient().storage
    .from("credentials")
    .createSignedUrl(path, 60);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Credential not found" }, { status: 404 });
  }

  // SEC-13: these are teacher qualification and ID-style documents. An admin reading another
  // user's document is exactly the access PROJECT.md promises is audited, and it was not.
  // Log only cross-user reads — a teacher opening their own file is not an admin action.
  if (record?.isPlatformAdmin && !isOwner) {
    const ownerId = path.split("/")[0] ?? "";
    await recordAdminAccess({
      adminUserId: user.id,
      action: "credential.viewed",
      targetType: "user",
      targetId: isUuid(ownerId) ? ownerId : user.id,
      metadata: {
        path,
        reason: new URL(request.url).searchParams.get("reason") ?? null,
      },
    });
  }

  return NextResponse.redirect(new URL(data.signedUrl, env.NEXT_PUBLIC_APP_URL));
}
