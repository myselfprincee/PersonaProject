import { google } from "googleapis";
import type { NextRequest } from 'next/server'
import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";

// /api/youtube/callback

export async function GET(request: NextRequest){
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    // Handle OAuth errors
    if (error) {
      console.error("OAuth error:", error);
      return Response.redirect(
        new URL(`/onboarding?error=${error}`, request.url)
      );
    }

    if (!code) {
      return Response.redirect(
        new URL("/onboarding?error=missing_code", request.url)
      );
    }

    const expectedState = request.cookies.get("youtube_oauth_state")?.value;
    if (!state || !expectedState || state !== expectedState) {
      return Response.redirect(
        new URL("/onboarding?error=invalid_oauth_state", request.url)
      );
    }

    const { userId } = await auth();
    if (!userId) {
      return Response.redirect(
        new URL("/onboarding?error=authentication_required", request.url)
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const publicKeys = [
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ].filter(Boolean);

    if (!supabaseUrl || !serviceRoleKey || publicKeys.includes(serviceRoleKey)) {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY must contain the Supabase secret/service-role key, not a public anon or publishable key"
      );
    }

    // Exchange code for tokens
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.NEXT_PUBLIC_APP_URL}/api/youtube/callback`,
    );

    const { tokens } = await oauth2Client.getToken(code);
    
    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error("No access or refresh token received");
    }

    console.log("Tokens received:", { hasAccessToken: !!tokens.access_token, hasRefreshToken: !!tokens.refresh_token });

    // Get YouTube channel info
    oauth2Client.setCredentials(tokens);
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });
    
    const channelsResponse = await youtube.channels.list({
      part: ["snippet"],
      mine: true,
    });

    const channel = channelsResponse.data.items?.[0];
    if (!channel) {
      throw new Error("No channel found");
    }

    const channelId = channel.id;
    const channelName = channel.snippet?.title;
    if (!channelId || !channelName) {
      throw new Error("YouTube channel data is incomplete");
    }
    
    // Get email from Google OAuth
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;
    if (!email) {
      throw new Error("Google account email is unavailable");
    }

    // Save to Supabase using service role (bypasses RLS)
    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
    
    const { error: dbError } = await supabase
      .from("youtube_connections")
      .insert({
        clerk_user_id: userId,
        channel_id: channelId,
        channel_name: channelName,
        google_account_email: email,
        refresh_token: tokens.refresh_token,
      });

    if (dbError) {
      console.error("Database error:", dbError);
      throw new Error(dbError.message);
    }

    console.log("YouTube connection saved:", {
      userId,
      channelId,
      channelName,
      email,
    });

    // Redirect back to onboarding with success
    return Response.redirect(
      new URL("/onboarding?youtube=connected", request.url)
    );

  } catch (error) {
    console.error("Callback error:", error);
    return Response.redirect(
      new URL("/onboarding?error=callback_failed", request.url)
    );
  }
}
