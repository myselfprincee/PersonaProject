import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getPublicPersonaSettingsForUser,
  updatePublicPersonaSettingsForUser,
} from "@/services/public-persona/public-persona.service";

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const settings = await getPublicPersonaSettingsForUser(userId);

    if (!settings) {
      return NextResponse.json(
        { error: "No YouTube channel connected." },
        { status: 404 },
      );
    }

    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load public persona settings.",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as { enabled?: boolean };

  if (typeof body.enabled !== "boolean") {
    return NextResponse.json(
      { error: "enabled must be a boolean." },
      { status: 400 },
    );
  }

  try {
    const settings = await updatePublicPersonaSettingsForUser({
      clerkUserId: userId,
      enabled: body.enabled,
    });

    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update public persona settings.",
      },
      { status: 500 },
    );
  }
}
