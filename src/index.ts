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

export async function fetchUserData(accessToken: string): Promise<XUserData> {
  const X_API_ENDPOINT =
    "https://api.x.com/2/users/me?user.fields=confirmed_email,username,name";

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
