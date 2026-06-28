import { Resend } from "resend";
import { createAdminClient } from "@/lib/db/supabase-admin";
import type { IngestionRunRecord } from "@/types/ingestion";

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return null;
  }

  return new Resend(apiKey);
}

function getFromEmail() {
  return process.env.RESEND_FROM_EMAIL ?? "Persona <onboarding@resend.dev>";
}

function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? null;
}

async function getRunEmailContext(run: IngestionRunRecord) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("youtube_connections")
    .select("channel_name, google_account_email")
    .eq("id", run.youtube_connection_id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return {
    channelName:
      (data as { channel_name?: string | null } | null)?.channel_name ??
      "your channel",
    email:
      (data as { google_account_email?: string | null } | null)
        ?.google_account_email ?? null,
  };
}

export async function sendIngestionCompletedEmail(run: IngestionRunRecord) {
  const resend = getResendClient();

  if (!resend) {
    console.log("[ingestion-email] skipping completion email because RESEND_API_KEY is missing", {
      ingestionRunId: run.id,
    });
    return { sent: false, reason: "missing_resend_api_key" } as const;
  }

  const context = await getRunEmailContext(run);

  if (!context.email) {
    console.log("[ingestion-email] skipping completion email because recipient email is missing", {
      ingestionRunId: run.id,
      youtubeConnectionId: run.youtube_connection_id,
    });
    return { sent: false, reason: "missing_recipient_email" } as const;
  }

  const appUrl = getAppUrl();
  const dashboardUrl = appUrl ? `${appUrl}/dashboard/content-ideas` : null;

  await resend.emails.send({
    from: getFromEmail(),
    to: context.email,
    subject: "Persona finished analyzing your videos",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
        <h2 style="margin-bottom: 12px;">Your Persona analysis is ready</h2>
        <p style="margin: 0 0 12px;">
          Persona finished analyzing <strong>${run.processed_videos}</strong> videos for
          <strong>${context.channelName}</strong>.
        </p>
        <p style="margin: 0 0 12px;">
          Your new video insights are now available and can be used to power stronger
          content ideas.
        </p>
        ${dashboardUrl ? `<p style="margin: 20px 0;"><a href="${dashboardUrl}" style="display: inline-block; background: #6c47ff; color: #ffffff; text-decoration: none; padding: 10px 16px; border-radius: 10px;">Open Content Ideas</a></p>` : ""}
        <p style="margin: 0; color: #6b7280; font-size: 14px;">
          Run ID: ${run.id}
        </p>
      </div>
    `,
  });

  console.log("[ingestion-email] sent completion email", {
    ingestionRunId: run.id,
    to: context.email,
  });

  return { sent: true } as const;
}
