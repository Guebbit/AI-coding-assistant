import type { Tool } from "./types";
import { getToken } from "./social.store";
import type { SocialProvider } from "./social.types";
import { assertAllowedHost, enforceRateLimit, sanitizePii } from "./social.policy";

function requireAccessToken(provider: SocialProvider): string {
  const token = getToken(provider);
  if (!token?.accessToken) {
    throw new Error(
      `No connected ${provider} account. Please connect ${provider} via /auth/${provider}/connect first.`
    );
  }
  return token.accessToken;
}

async function providerGet(
  provider: SocialProvider,
  pathOrUrl: string,
  token: string
): Promise<unknown> {
  enforceRateLimit(provider);

  const url = pathOrUrl.startsWith("http")
    ? pathOrUrl
    : (() => {
        switch (provider) {
          case "linkedin":
            return `https://api.linkedin.com${pathOrUrl}`;
          case "x":
            return `https://api.x.com${pathOrUrl}`;
          case "github":
            return `https://api.github.com${pathOrUrl}`;
        }
      })();

  assertAllowedHost(provider, url);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(provider === "linkedin" ? { "x-restli-protocol-version": "2.0.0" } : {}),
      ...(provider === "github" ? { "user-agent": "AI-coding-assistant" } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(
      `${provider} API request failed with status ${response.status}. Verify OAuth scopes and account permissions.`
    );
  }

  const json = (await response.json()) as unknown;
  return sanitizePii(json);
}

export const linkedinProfileLookupTool: Tool = {
  name: "linkedin_profile_lookup",
  description:
    "Lookup LinkedIn profile data with official OAuth token. Input: { memberUrn?: string }",
  async execute({ memberUrn }) {
    const token = requireAccessToken("linkedin");
    const endpoint =
      typeof memberUrn === "string" && memberUrn.trim()
        ? `/v2/people/(id:${encodeURIComponent(memberUrn.trim())})?projection=(id,localizedFirstName,localizedLastName,headline)`
        : "/v2/userinfo";
    const profile = await providerGet("linkedin", endpoint, token);
    return {
      provider: "linkedin",
      target: typeof memberUrn === "string" && memberUrn.trim() ? "member" : "self",
      profile,
    };
  },
};

export const xProfileLookupTool: Tool = {
  name: "x_profile_lookup",
  description:
    "Lookup X profile data with official OAuth token. Input: { username?: string }",
  async execute({ username }) {
    const token = requireAccessToken("x");
    const endpoint =
      typeof username === "string" && username.trim()
        ? `/2/users/by/username/${encodeURIComponent(username.trim())}?user.fields=description,public_metrics,verified,created_at`
        : "/2/users/me?user.fields=description,public_metrics,verified,created_at";
    const profile = await providerGet("x", endpoint, token);
    return {
      provider: "x",
      target: typeof username === "string" && username.trim() ? username.trim() : "self",
      profile,
    };
  },
};

export const githubProfileLookupTool: Tool = {
  name: "github_profile_lookup",
  description:
    "Lookup GitHub profile data with official OAuth token. Input: { username?: string }",
  async execute({ username }) {
    const token = requireAccessToken("github");
    const endpoint =
      typeof username === "string" && username.trim()
        ? `/users/${encodeURIComponent(username.trim())}`
        : "/user";
    const profile = await providerGet("github", endpoint, token);
    return {
      provider: "github",
      target: typeof username === "string" && username.trim() ? username.trim() : "self",
      profile,
    };
  },
};
