import "server-only";
import type { PlatformCredentialPayload } from "types/secure/platformCredentials";

export const TOSS_CERT_CREDENTIAL_KEY = "integration.toss.cert" as const;
export const TOSS_CERT_TOKEN_URL = "https://oauth2.cert.toss.im/token";
export const TOSS_CERT_API_BASE_URL = "https://cert.toss.im/api/v2/sign/user/auth/id";
export const TOSS_CERT_REQUEST_TIMEOUT_MS = 15_000;

// Toss Cert's Node.js example public key, pinned from toss/toss-cert-examples at
// 0e61e76ccc4c7639f7691ba2d2b82814b1626c27 (nodejs/src/nodejs_example.js).
export const TOSS_CERT_BASE64_PUBLIC_KEY =
  "MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAoVdxG0Qi9pip46Jw9ImSlPVD8+L2mM47ey6EZna7D7utgNdh8Tzkjrm1Yl4h6kPJrhdWvMIJGS51+6dh041IXcJEoUquNblUEqAUXBYwQM8PdfnS12SjlvZrP4q6whBE7IV1SEIBJP0gSK5/8Iu+uld2ctJiU4p8uswL2bCPGWdvVPltxAg6hfAG/ImRUKPRewQsFhkFvqIDCpO6aeaR10q6wwENZltlJeeRnl02VWSneRmPqqypqCxz0Y+yWCYtsA+ngfZmwRMaFkXcWjaWnvSqqV33OAsrQkvuBHWoEEkvQ0P08+h9Fy2+FhY9TeuukQ2CVFz5YyOhp25QtWyQI+IaDKk+hLxJ1APR0c3tmV0ANEIjO6HhJIdu2KQKtgFppvqSrZp2OKtI8EZgVbWuho50xvlaPGzWoMi9HSCb+8ARamlOpesxHH3O0cTRUnft2Zk1FHQb2Pidb2z5onMEnzP2xpTqAIVQyb6nMac9tof5NFxwR/c4pmci+1n8GFJIFN18j2XGad1mNyio/R8LabqnzNwJC6VPnZJz5/pDUIk9yKNOY0KJe64SRiL0a4SNMohtyj6QlA/3SGxaEXb8UHpophv4G9wN1CgfyUamsRqp8zo5qDxBvlaIlfkqJvYPkltj7/23FHDjPi8q8UkSiAeu7IV5FTfB5KsiN8+sGSMCAwEAAQ==";

export function isTossCertTestCredential(payload: Partial<PlatformCredentialPayload>): boolean {
  return payload.clientId?.startsWith("test_") === true && payload.clientSecret?.startsWith("test_") === true;
}
