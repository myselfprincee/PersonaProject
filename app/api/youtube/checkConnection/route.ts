import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { auth } from "@clerk/nextjs/server";

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      { success: false, connected: false },
      { status: 401 },
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("youtube_connections")
    .select("id")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { success: false, connected: false, error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    connected: Boolean(data),
  });
}
