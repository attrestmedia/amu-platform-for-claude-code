import "server-only";

import { resolveInstagramAuthMode } from "consts/thirdparty/instagram";
import { InstagramGraphClient } from "libs/api/thirdparty/instagram/instagramClient";
import {
  getInstagramAccountIdentityFields,
  resolveInstagramAccountIdentity,
} from "libs/api/thirdparty/instagram/instagramIdentity";
import { ThreadsApiClient } from "libs/api/thirdparty/threads/threadsClient";
import { getDecryptedLinkedInMemberToken } from "libs/database/secure/linkedinMemberTokens";
import { getCredentialStatus } from "libs/database/secure/credentials";
import { resolveSocialMarketingCredential } from "libs/marketing/auth/marketingOAuthResolver";
import { toErrorMessage, toSafeString, toUnknownRecord } from "utils/common/typeUtils";
import { logger } from "utils/log";

export const SOCIAL_PROFILE_CHANNELS = ["threads", "instagram", "linkedin", "naver_blog"] as const;
export type SocialProfileChannel = (typeof SOCIAL_PROFILE_CHANNELS)[number];

type ProfileResult = {
  channel: SocialProfileChannel;
  status: "fetched" | "partial" | "manual" | "not_connected" | "unsupported" | "failed";
  capability: "full_profile" | "identity_profile" | "manual_profile" | "not_available";
  permissions?: {
    canPublish: boolean;
    canCollectPostAnalytics: boolean;
    canCollectProfileAnalytics: boolean;
  };
  profile?: {
    accountId: string;
    username: string;
    displayName: string;
    biography: string;
    website: string;
    profilePictureUrl: string;
    profileUrl: string;
    followers?: number;
    mediaCount?: number;
  };
  reason?: string;
};

function emptyProfile(accountId = "") {
  return {
    accountId,
    username: "",
    displayName: "",
    biography: "",
    website: "",
    profilePictureUrl: "",
    profileUrl: "",
  };
}

async function fetchThreadsProfile(universeId: string): Promise<ProfileResult> {
  const credential = await resolveSocialMarketingCredential(universeId, "threads");
  const accessToken = toSafeString(credential?.clientSecret);
  if (!accessToken) return { channel: "threads", status: "not_connected", capability: "full_profile", reason: "threads_credential_missing" };
  const client = new ThreadsApiClient({
    baseUrl: typeof credential?.extras?.graphBaseUrl === "string" ? credential.extras.graphBaseUrl : undefined,
  });
  const raw = toUnknownRecord(await client.getOwnProfile({ accessToken }));
  const username = toSafeString(raw.username || credential?.extras?.username);
  return {
    channel: "threads",
    status: "fetched",
    capability: "full_profile",
    profile: {
      ...emptyProfile(toSafeString(raw.id || credential?.clientId)),
      username,
      displayName: toSafeString(raw.name),
      biography: toSafeString(raw.threads_biography || raw.biography),
      profilePictureUrl: toSafeString(raw.threads_profile_picture_url || raw.threadsProfilePictureUrl),
      profileUrl: username ? `https://www.threads.net/@${username}` : "",
    },
  };
}

async function fetchInstagramProfile(universeId: string): Promise<ProfileResult> {
  const credential = await resolveSocialMarketingCredential(universeId, "instagram");
  const accessToken = toSafeString(credential?.clientSecret);
  const accountId = toSafeString(credential?.clientId);
  if (!accessToken || !accountId) {
    return { channel: "instagram", status: "not_connected", capability: "full_profile", reason: "instagram_credential_missing" };
  }
  const authMode = resolveInstagramAuthMode(credential?.extras?.authMode, credential?.extras?.graphBaseUrl);
  const client = new InstagramGraphClient({ authMode });
  const raw = toUnknownRecord(
    await client.getAccountFields({
      accessToken,
      instagramUserId: accountId,
      fields: [
        ...getInstagramAccountIdentityFields(authMode),
        "name",
        "biography",
        "website",
        "profile_picture_url",
        "followers_count",
        "media_count",
      ],
    }),
  );
  const identity = resolveInstagramAccountIdentity(raw, authMode);
  const username = identity.username || toSafeString(credential?.extras?.username);
  return {
    channel: "instagram",
    status: "fetched",
    capability: "full_profile",
    profile: {
      ...emptyProfile(identity.accountId || accountId),
      username,
      displayName: toSafeString(raw.name),
      biography: toSafeString(raw.biography),
      website: toSafeString(raw.website),
      profilePictureUrl: toSafeString(raw.profile_picture_url),
      profileUrl: username ? `https://www.instagram.com/${username}/` : "",
      followers: Number(raw.followers_count || 0),
      mediaCount: Number(raw.media_count || 0),
    },
  };
}

async function fetchLinkedInProfile(universeId: string, profileSlug: string): Promise<ProfileResult> {
  const token = await getDecryptedLinkedInMemberToken(universeId);
  if (!token?.accessToken) {
    return { channel: "linkedin", status: "not_connected", capability: "identity_profile", reason: "linkedin_token_missing" };
  }
  if (token.expired) {
    return { channel: "linkedin", status: "failed", capability: "identity_profile", reason: "linkedin_token_expired" };
  }
  const response = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${token.accessToken}` },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const raw = toUnknownRecord(await response.json().catch(() => ({})));
  if (!response.ok) throw new Error(toSafeString(raw.message) || `linkedin_userinfo_failed:${response.status}`);
  const scopes = new Set((token.scope || []).map(toSafeString).filter(Boolean));
  return {
    channel: "linkedin",
    status: "partial",
    capability: "identity_profile",
    reason: "linkedin_openid_profile_does_not_include_about_or_experience",
    permissions: {
      canPublish: scopes.has("w_member_social"),
      canCollectPostAnalytics: scopes.has("r_member_postAnalytics"),
      canCollectProfileAnalytics: scopes.has("r_member_profileAnalytics"),
    },
    profile: {
      ...emptyProfile(toSafeString(raw.sub || token.memberId)),
      displayName: toSafeString(raw.name || token.displayName),
      profilePictureUrl: toSafeString(raw.picture),
      profileUrl: profileSlug ? `https://www.linkedin.com/in/${encodeURIComponent(profileSlug)}/` : "",
    },
  };
}

function fetchNaverBlogProfile(blogId: string): ProfileResult {
  if (!blogId) {
    return {
      channel: "naver_blog",
      status: "unsupported",
      capability: "not_available",
      reason: "naver_blog_id_missing",
    };
  }
  return {
    channel: "naver_blog",
    status: "manual",
    capability: "manual_profile",
    reason: "naver_blog_official_profile_and_analytics_api_unavailable",
    profile: {
      ...emptyProfile(blogId),
      username: blogId,
      displayName: "Naver Blog",
      profileUrl: `https://blog.naver.com/${encodeURIComponent(blogId)}`,
    },
  };
}

async function fetchChannelProfile(
  universeId: string,
  channel: SocialProfileChannel,
  metadata: { linkedinProfileSlug: string; naverBlogId: string },
): Promise<ProfileResult> {
  try {
    if (channel === "threads") return await fetchThreadsProfile(universeId);
    if (channel === "instagram") return await fetchInstagramProfile(universeId);
    if (channel === "linkedin") return await fetchLinkedInProfile(universeId, metadata.linkedinProfileSlug);
    return fetchNaverBlogProfile(metadata.naverBlogId);
  } catch (error) {
    const message = toErrorMessage(error, `${channel}_profile_fetch_failed`);
    logger.warn("[marketing/social-profile] fetch failed", { universeId, channel, error: message });
    return { channel, status: "failed", capability: channel === "linkedin" ? "identity_profile" : "full_profile", reason: message };
  }
}

export async function fetchSocialProfiles(args: { universeId: string; channels?: string[] }) {
  const requested = new Set((args.channels || []).map(toSafeString));
  const channels = SOCIAL_PROFILE_CHANNELS.filter((channel) => requested.size === 0 || requested.has(channel));
  const credentialStatus = await getCredentialStatus(args.universeId);
  const linkedinExtras = toUnknownRecord(credentialStatus.linkedin?.extras);
  const naverBlogExtras = toUnknownRecord(credentialStatus.naver_blog?.extras);
  const metadata = {
    linkedinProfileSlug: toSafeString(linkedinExtras.profileSlug),
    naverBlogId: toSafeString(naverBlogExtras.blogId),
  };
  const profiles = await Promise.all(channels.map((channel) => fetchChannelProfile(args.universeId, channel, metadata)));
  return { universeId: args.universeId, fetchedAt: new Date().toISOString(), profiles };
}
