# X (Twitter) Auth Adapter for Parse Server

The X (Twitter) Auth Adapter integrates seamlessly with Parse Server to enable authentication using X (formerly Twitter) accounts. This adapter facilitates secure user authentication leveraging X's **OAuth 2.0 Authorization Code Flow with PKCE (Proof Key for Code Exchange)** protocol.

## Features

- **X/Twitter Authentication**: Allow users to sign up and log in using their X accounts via **OAuth 2.0 with PKCE**.
- **Secure Token Validation**: Verifies the access token provided by X after the PKCE flow to ensure authenticity.
- **Profile Data Integration**: Can potentially fetch basic user profile data from X upon successful authentication using the obtained access token.

## Installation

The X Auth Adapter is part of the `@parseauthkit/auth-adapters` package. Ensure this package is installed in your Parse Server project:

```bash
npm install @parseauthkit/auth-adapters
# or
yarn add @parseauthkit/auth-adapters
```

## Configuration

To use the X Auth Adapter in your Parse Server, register it within the `auth` section of your Parse Server options. **Typically, OAuth 2.0 with PKCE requires client-side handling of the flow and doesn't necessitate specific server-side API keys (like consumer keys) within the adapter configuration itself.** The validation relies on the access token provided by the client after completing the PKCE flow.

```typescript
import { initializeXAdapter } from "@parseauthkit/auth-adapters";

const xAdapter = initializeXAdapter();

const api = new ParseServer({
  // ... other Parse Server config (appId, masterKey, serverURL, etc.)
  auth: {
    x: xAdapter, // Register the adapter with the key 'x'
    // ... other adapters
  },
});
```

Make sure your X Application is configured correctly in the Twitter Developer Portal with the appropriate **Client ID**, **Callback URI(s)**, and enabled for **OAuth 2.0**.

## Usage

Integrating X authentication with OAuth 2.0 PKCE involves these client-side steps:

1. **Generate Code Verifier & Challenge**: Create a cryptographically random `code_verifier` and derive the `code_challenge` (using SHA256).
2. **Initiate OAuth Flow**: Redirect the user to X's OAuth 2.0 authorization URL (`https://twitter.com/i/oauth2/authorize`), including parameters like `response_type=code`, `client_id`, `redirect_uri`, `scope`, `state`, `code_challenge`, and `code_challenge_method=S256`.
3. **Receive Authorization Code**: After the user authorizes your application, X redirects back to your `redirect_uri` with an `authorization_code` and the `state`.
4. **Exchange Code for Tokens**: Your client-side application makes a POST request to X's token endpoint (`https://api.twitter.com/2/oauth2/token`), providing the `authorization_code`, `grant_type=authorization_code`, `client_id`, `redirect_uri`, and the original `code_verifier`.
5. **Receive Tokens**: X responds with an `access_token`, `refresh_token` (if applicable), `scope`, and `expires_in`. You'll likely need to make a separate request to `https://api.twitter.com/2/users/me` using the `access_token` to get the user's ID and screen name.
6. **Authenticate with Parse Server**: Use the obtained `access_token` and the user's X `id` (retrieved in the previous step) to authenticate with your Parse Server via the `linkWith` or `logInWith` method from the Parse SDK.

For a complete implementation example including token exchange and OAuth provider configuration, please refer to the [README.md](../../../README.md) file.

**Note:** The exact `authData` fields required by the `@parseauthkit/auth-adapters` adapter are **`id`** (the user's unique X ID) and **`access_token`** (obtained via the OAuth 2.0 PKCE flow). Refer to the adapter's source code or type definitions for any additional optional fields.
