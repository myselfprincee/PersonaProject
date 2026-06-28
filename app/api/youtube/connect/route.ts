import { google } from "googleapis";
import type { NextRequest } from 'next/server'
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
// /api/youtube/connect

export async function GET(request: NextRequest){
  const { userId } = await auth();

  if (!userId) {
    return Response.redirect(
      new URL("/onboarding?error=authentication_required", request.url)
    );
  }

  const state = crypto.randomUUID();

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/youtube/callback`,
  );

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/youtube.force-ssl",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ],
    state,
  });

  const response = NextResponse.redirect(url);
  response.cookies.set("youtube_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/youtube/callback",
    maxAge: 10 * 60,
  });

  return response;

}
