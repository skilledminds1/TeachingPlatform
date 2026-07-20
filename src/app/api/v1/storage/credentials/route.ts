import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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
  if (!record?.isPlatformAdmin && !path.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await createAdminClient().storage
    .from("credentials")
    .createSignedUrl(path, 60);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Credential not found" }, { status: 404 });
  }
  return NextResponse.redirect(new URL(data.signedUrl, env.NEXT_PUBLIC_APP_URL));
}
