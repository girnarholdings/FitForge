/**
 * FIREBASE ID-TOKEN VERIFICATION, at the edge.
 *
 * ─── why this exists ────────────────────────────────────────────────────────────────────────
 * The model picker hides the company-key model from signed-out visitors. Hiding is a UI courtesy,
 * NOT a boundary: this worker is called directly by a browser, so anyone can post
 * `{"model":"mistral-small-latest"}` with curl and spend the company's Mistral allowance. The
 * whole point of gating that model is that a flood of anonymous traffic must not degrade the
 * experience of people who signed in — which only holds if the gate is enforced HERE.
 *
 * ─── what is verified ───────────────────────────────────────────────────────────────────────
 * A Firebase ID token is an RS256 JWT signed by Google. Verification is the standard four checks
 * (Firebase's own documented list for third-party verifiers):
 *   1. signature — against Google's published public keys, matched by the token's `kid`
 *   2. `exp`     — not expired (with a small clock-skew allowance)
 *   3. `aud`     — equals this Firebase project id
 *   4. `iss`     — equals https://securetoken.google.com/<project id>
 * `sub` is then the user's uid.
 *
 * ─── why JWKS rather than the X.509 endpoint ────────────────────────────────────────────────
 * Firebase documents an X.509 certificate endpoint, which would mean parsing ASN.1 by hand to get
 * at the public key. The same keys are published in JWK form, which `crypto.subtle.importKey`
 * consumes directly — no parser to get wrong, and nothing to maintain when Google rotates keys.
 *
 * ─── failure is always "not signed in", never a 500 ─────────────────────────────────────────
 * Every failure path returns null. A malformed token, an expired one, an unreachable JWKS: all of
 * them mean "we cannot prove who this is", and the caller's answer to that is to serve the free
 * models — not to break. A token problem must never cost someone their workout answer.
 */

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

/** Tolerated clock skew between Google's clock and the edge's, in seconds. */
const SKEW_S = 60;

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
}

/**
 * JWKS cache, per isolate. Google rotates these keys roughly daily and always publishes the new
 * one before retiring the old, so a short TTL is safe; a cache miss simply costs one fetch.
 */
let jwksCache: { at: number; keys: Jwk[] } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

async function fetchJwks(): Promise<Jwk[]> {
  if (jwksCache && Date.now() - jwksCache.at < JWKS_TTL_MS) return jwksCache.keys;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error(`JWKS ${res.status}`);
  const body = (await res.json()) as { keys?: Jwk[] };
  const keys = Array.isArray(body.keys) ? body.keys : [];
  // Only cache a usable answer — caching an empty list would blind the worker for an hour.
  if (keys.length > 0) jwksCache = { at: Date.now(), keys };
  return keys;
}

/**
 * base64url → bytes. JWTs use the URL-safe alphabet and drop padding.
 *
 * Backed by an explicit `ArrayBuffer` rather than the default: TypeScript's newer lib types make
 * `Uint8Array<ArrayBufferLike>` (which could be a SharedArrayBuffer) unassignable to the
 * `BufferSource` that WebCrypto wants, and being concrete here is cheaper than casting at each
 * call site.
 */
function b64uToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64uToJson(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(new TextDecoder().decode(b64uToBytes(s))) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export interface VerifiedUser {
  uid: string;
  email?: string;
}

/**
 * Verify a Firebase ID token. Returns the user on success, `null` on ANY failure.
 *
 * `projectId` is the Firebase project this worker trusts — without it there is nothing to check
 * `aud` against, so an unset project id means "no user is ever verified", which fails closed.
 */
export async function verifyFirebaseToken(
  token: string | undefined,
  projectId: string | undefined,
): Promise<VerifiedUser | null> {
  if (!token || !projectId) return null;
  // A cheap sanity bound before any crypto: a real ID token is ~1KB, and this is attacker input.
  if (token.length > 4096) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [rawHeader, rawPayload, rawSig] = parts as [string, string, string];

  const header = b64uToJson(rawHeader);
  const payload = b64uToJson(rawPayload);
  if (!header || !payload) return null;
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null;

  // Claims first — they are free, and a wrong-audience token never deserves a crypto operation.
  const now = Math.floor(Date.now() / 1000);
  const exp = typeof payload.exp === 'number' ? payload.exp : 0;
  const iat = typeof payload.iat === 'number' ? payload.iat : 0;
  const sub = typeof payload.sub === 'string' ? payload.sub : '';
  if (exp + SKEW_S < now) return null;
  if (iat - SKEW_S > now) return null;
  if (payload.aud !== projectId) return null;
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (!sub) return null;

  try {
    const jwk = (await fetchJwks()).find((k) => k.kid === header.kid);
    if (!jwk) return null;

    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      b64uToBytes(rawSig),
      new TextEncoder().encode(`${rawHeader}.${rawPayload}`),
    );
    if (!ok) return null;

    return { uid: sub, email: typeof payload.email === 'string' ? payload.email : undefined };
  } catch {
    // JWKS unreachable, malformed key, WebCrypto refusal — all "cannot prove who this is".
    return null;
  }
}
