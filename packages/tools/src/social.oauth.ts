import {
  getClientId,
  getClientSecret,
  getProviderPolicy,
} from "./social.providers";
import { assertAllowedHost } from "./social.policy";
import { issueOAuthState } from "./social.store";
import type { SocialProvider, SocialTokenRecord } from "./social.types";

function parseScopes(rawScope: unknown): string[] {
  if (typeof rawScope !== "string" || rawScope.trim() === "") {
    return [];
  }
  return rawScope
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

export function createAuthorizationUrl(
  provider: SocialProvider,
  redirectUri: string
): { authorizationUrl: string; state: string } {
  const policy = getProviderPolicy(provider);
  const clientId = getClientId(provider);
  if (!clientId) {
    throw new Error(
      `Missing client id. Set SOCIAL_${provider.toUpperCase()}_CLIENT_ID.`
    );
  }
  if (!redirectUri) {
    throw new Error(
      `Missing redirect URI. Set SOCIAL_${provider.toUpperCase()}_REDIRECT_URI or provide redirect_uri query.`
    );
  }

  assertAllowedHost(provider, policy.authorizeUrl);
  const state = issueOAuthState(provider, redirectUri);
  const url = new URL(policy.authorizeUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", policy.defaultScopes.join(" "));
  url.searchParams.set("state", state);

  if (provider === "x") {
    const challenge = process.env.SOCIAL_X_CODE_CHALLENGE?.trim();
    if (!challenge) {
      throw new Error(
        "Missing SOCIAL_X_CODE_CHALLENGE for X OAuth2 PKCE authorization."
      );
    }
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "plain");
  }

  return { authorizationUrl: url.toString(), state };
}

export async function exchangeCodeForToken(
  provider: SocialProvider,
  code: string,
  redirectUri: string
): Promise<SocialTokenRecord> {
  const policy = getProviderPolicy(provider);
  const clientId = getClientId(provider);
  const clientSecret = getClientSecret(provider);

  if (!clientId || !clientSecret) {
    throw new Error(
      `Missing OAuth credentials for ${provider}. Configure SOCIAL_${provider.toUpperCase()}_CLIENT_ID and SOCIAL_${provider.toUpperCase()}_CLIENT_SECRET.`
    );
  }

  assertAllowedHost(provider, policy.tokenUrl);

  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", redirectUri);
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);

  if (provider === "x") {
    const verifier = process.env.SOCIAL_X_CODE_VERIFIER?.trim();
    if (!verifier) {
      throw new Error(
        "Missing SOCIAL_X_CODE_VERIFIER for X OAuth2 PKCE token exchange."
      );
    }
    body.set("code_verifier", verifier);
  }

  const response = await fetch(policy.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(
      `OAuth token exchange failed for ${provider} with status ${response.status}.`
    );
  }

  const tokenResponse = (await response.json()) as Record<string, unknown>;
  const accessToken = tokenResponse.access_token;
  if (typeof accessToken !== "string" || !accessToken.trim()) {
    throw new Error(`OAuth token response for ${provider} is missing access_token.`);
  }

  const refreshToken =
    typeof tokenResponse.refresh_token === "string"
      ? tokenResponse.refresh_token
      : undefined;
  const expiresIn =
    typeof tokenResponse.expires_in === "number"
      ? tokenResponse.expires_in
      : undefined;
  const connectedAt = new Date().toISOString();
  const expiresAt =
    typeof expiresIn === "number" && expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : undefined;
  const scopes = parseScopes(tokenResponse.scope);
  const accountId =
    typeof tokenResponse.user_id === "string"
      ? tokenResponse.user_id
      : typeof tokenResponse.sub === "string"
        ? tokenResponse.sub
        : undefined;

  return {
    accessToken,
    refreshToken,
    scopes,
    connectedAt,
    expiresAt,
    accountId,
  };
}
