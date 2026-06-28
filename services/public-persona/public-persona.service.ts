import { createAdminClient } from "@/lib/db/supabase-admin";

const PUBLIC_PERSONA_MIGRATION_ERROR =
  "Public persona database fields are not available yet. Run the public persona Supabase migration before using this feature.";

type PostgrestLikeError = {
  code?: string | null;
  message?: string | null;
};

export type YoutubeConnection = {
  id: string;
  channelId: string;
  channelName: string;
};

export type PublicPersonaSettings = {
  youtubeConnectionId: string;
  channelId: string;
  channelName: string;
  publicPersonaEnabled: boolean;
  publicSlug: string | null;
};

function isMissingPublicPersonaSchemaError(error: PostgrestLikeError | null) {
  if (!error) {
    return false;
  }

  return (
    error.code === "42703" ||
    error.message?.includes("public_persona_enabled") ||
    error.message?.includes("public_slug") ||
    false
  );
}

function toPublicPersonaMigrationError(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    isMissingPublicPersonaSchemaError(error as PostgrestLikeError)
  ) {
    return new Error(PUBLIC_PERSONA_MIGRATION_ERROR);
  }

  return error;
}

function slugifyChannelName(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

async function generateUniquePublicSlug(
  youtubeConnectionId: string,
  channelName: string,
  channelId: string,
) {
  const supabase = createAdminClient();
  const baseSlug =
    slugifyChannelName(channelName) ||
    `channel-${channelId.slice(0, 8).toLowerCase()}`;

  let candidate = baseSlug;
  let suffix = 2;

  for (;;) {
    const { data, error } = await supabase
      .from("youtube_connections")
      .select("id")
      .eq("public_slug", candidate)
      .maybeSingle();

    if (error) {
      throw toPublicPersonaMigrationError(error);
    }

    if (!data || data.id === youtubeConnectionId) {
      return candidate;
    }

    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

export async function getYoutubeConnectionForUser(clerkUserId: string) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("youtube_connections")
    .select("id, channel_id, channel_name")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id as string,
    channelId: data.channel_id as string,
    channelName: data.channel_name as string,
  } satisfies YoutubeConnection;
}

export async function getPublicPersonaSettingsForUser(clerkUserId: string) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("youtube_connections")
    .select("id, channel_id, channel_name, public_persona_enabled, public_slug")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (error) {
    throw toPublicPersonaMigrationError(error);
  }

  if (!data) {
    return null;
  }

  return {
    youtubeConnectionId: data.id as string,
    channelId: data.channel_id as string,
    channelName: data.channel_name as string,
    publicPersonaEnabled: Boolean(data.public_persona_enabled),
    publicSlug: (data.public_slug as string | null) ?? null,
  } satisfies PublicPersonaSettings;
}

export async function updatePublicPersonaSettingsForUser(input: {
  clerkUserId: string;
  enabled: boolean;
}) {
  const current = await getPublicPersonaSettingsForUser(input.clerkUserId);

  if (!current) {
    throw new Error("No YouTube channel connected for this user.");
  }

  const supabase = createAdminClient();
  const publicSlug = input.enabled
    ? (current.publicSlug ??
      (await generateUniquePublicSlug(
        current.youtubeConnectionId,
        current.channelName,
        current.channelId,
      )))
    : current.publicSlug;

  const { data, error } = await supabase
    .from("youtube_connections")
    .update({
      public_persona_enabled: input.enabled,
      public_slug: publicSlug,
    })
    .eq("id", current.youtubeConnectionId)
    .eq("clerk_user_id", input.clerkUserId)
    .select("id, channel_id, channel_name, public_persona_enabled, public_slug")
    .single();

  if (error) {
    throw toPublicPersonaMigrationError(error);
  }

  return {
    youtubeConnectionId: data.id as string,
    channelId: data.channel_id as string,
    channelName: data.channel_name as string,
    publicPersonaEnabled: Boolean(data.public_persona_enabled),
    publicSlug: (data.public_slug as string | null) ?? null,
  } satisfies PublicPersonaSettings;
}

export async function getPublicPersonaBySlug(slug: string) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("youtube_connections")
    .select("id, channel_id, channel_name, public_persona_enabled, public_slug")
    .eq("public_slug", slug)
    .eq("public_persona_enabled", true)
    .maybeSingle();

  if (error) {
    throw toPublicPersonaMigrationError(error);
  }

  if (!data) {
    return null;
  }

  return {
    youtubeConnectionId: data.id as string,
    channelId: data.channel_id as string,
    channelName: data.channel_name as string,
    publicPersonaEnabled: Boolean(data.public_persona_enabled),
    publicSlug: data.public_slug as string,
  } satisfies PublicPersonaSettings;
}
