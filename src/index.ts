// Note: do not import Parse dependency. see https://github.com/parse-community/parse-server/issues/6467
/* global Parse */

export interface XParseServerAuthOptions {
  module: XAuthAdapter; // Keep reference to the class type
  options?: unknown; // Generally unused for X, defined for interface consistency
}

export interface XAuthData {
  id: string; // User's X ID
  access_token: string;
}

export interface XUserData {
  id: string;
  verified_email?: string;
  username: string;
  name: string;
  [key: string]: string | undefined;
}

export interface XTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
}

export class XAuthAdapter {
  constructor() {}

  async validateAuthData(
    authData: XAuthData,
    _adapterOptions: XParseServerAuthOptions,
    _request: Parse.Cloud.TriggerRequest
  ): Promise<XAuthData & { email?: string; username?: string; name?: string }> {
    const { id: userId, access_token: accessToken } = authData;

    if (!userId || !accessToken) {
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        'X authData must include "id" and "access_token".'
      );
    }

    try {
      const xUserData = await fetchUserData(accessToken);

      if (xUserData.id !== userId) {
        throw new Parse.Error(
          Parse.Error.OBJECT_NOT_FOUND,
          "X token is valid but does not match the provided user ID."
        );
      }

      return {
        ...authData,
        ...(xUserData.verified_email && { email: xUserData.verified_email }),
        ...(xUserData.username && { username: xUserData.username }),
        ...(xUserData.name && { name: xUserData.name }),
      };
    } catch (error: any) {
      if (error instanceof Parse.Error) {
        throw error;
      }

      if (error instanceof XAuthError) {
        const parseErrorCode =
          error.type === "AUTH"
            ? Parse.Error.OBJECT_NOT_FOUND
            : Parse.Error.INTERNAL_SERVER_ERROR;
        throw new Parse.Error(parseErrorCode, error.message);
      }

      throw new Parse.Error(
        Parse.Error.INTERNAL_SERVER_ERROR,
        error.message || "Unknown validation error"
      );
    }
  }

  validateAppId(): Promise<void> {
    return Promise.resolve();
  }

  validateOptions({ module }: XParseServerAuthOptions): void {
    if (!(module instanceof XAuthAdapter)) {
      throw new Error("X Adapter: Module must be an instance of XAuthAdapter.");
    }
  }
}

export class XAuthError extends Error {
  constructor(
    message: string,
    public readonly type: "AUTH" | "API" | "NETWORK",
    public readonly status?: number
  ) {
    super(message);
    this.name = "XAuthError";
  }
}

export function initializeXAdapter(): XParseServerAuthOptions {
  return { module: new XAuthAdapter(), options: {} };
}

export async function fetchUserData(
  accessToken: string,
  fields: string[] = ["confirmed_email", "username", "name"]
): Promise<XUserData> {
  const X_API_ENDPOINT = `https://api.x.com/2/users/me?user.fields=${fields.join(",")}`;

  try {
    const response = await fetch(X_API_ENDPOINT, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const responseData = await response.json();

    if (!response.ok) {
      const isAuthError = response.status === 401 || response.status === 403;
      const errorType = isAuthError ? "AUTH" : "API";
      const errorMessage = isAuthError
        ? "Invalid or expired X access token (X API)."
        : `X API responded with status ${response.status}. Body: ${JSON.stringify(
            responseData
          )}`;

      console.error("X-API-FETCH: Fetch failed - API error.", {
        status: response.status,
        body: responseData,
      });

      throw new XAuthError(errorMessage, errorType, response.status);
    }

    const xUserData = responseData.data;
    if (!xUserData) {
      console.error(
        "X-API-FETCH: Fetch failed - API did not return user data.",
        responseData
      );
      throw new XAuthError("X API did not return expected user data.", "API");
    }

    return xUserData;
  } catch (error: any) {
    if (error instanceof XAuthError) {
      throw error;
    }
    console.error("X-API-FETCH: Network or parsing error:", error);
    throw new XAuthError(
      `Failed to fetch X user data: ${error.message || "Unknown error"}`,
      "NETWORK"
    );
  }
}

export async function exchangeXCodeForToken(
  code: string,
  pkceVerifier: string,
  clientId: string,
  clientSecret: string | undefined,
  redirectUri: string
): Promise<XTokenResponse> {
  const tokenUrl = "https://api.x.com/2/oauth2/token";
  const tokenParams = new URLSearchParams();
  tokenParams.append("code", code);
  tokenParams.append("grant_type", "authorization_code");
  tokenParams.append("client_id", clientId);
  tokenParams.append("redirect_uri", redirectUri);
  tokenParams.append("code_verifier", pkceVerifier);

  const tokenHeaders: HeadersInit = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (clientSecret) {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    tokenHeaders["Authorization"] = `Basic ${basicAuth}`;
    console.log("X Helper: Using Basic Auth for token exchange (Confidential Client).");
  } else {
    console.log("X Helper: Not using Basic Auth for token exchange (Public Client).");
  }

  try {
    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: tokenHeaders,
      body: tokenParams.toString(),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      console.error(`X Token Exchange Error (${tokenResponse.status}): ${errorBody}`);

      throw new Error(
        `Failed to exchange X code for token. Status: ${
          tokenResponse.status
        }. Body: ${errorBody.substring(0, 200)}`
      );
    }

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
      throw new Error("Access token missing in X API response.");
    }
    return tokenData;
  } catch (error: any) {
    console.error("X API: Error during token exchange request:", error);
    throw new Error(`X token exchange failed: ${error.message}`);
  }
}
