import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";

/**
 * Sessão sem estado em cookie httpOnly cifrado com AES-256-GCM.
 * Funciona em serverless (Vercel) sem banco de sessões. O token do GitHub
 * fica dentro do cookie cifrado: nunca é legível pelo JavaScript do navegador.
 */
export const SESSION_COOKIE = "rc_session";
export const STATE_COOKIE = "rc_oauth_state";
const SESSION_TTL_SEC = 8 * 60 * 60;

const sessionSchema = z.object({
  uid: z.number().int().positive(),
  login: z.string().min(1).max(100),
  avatar: z.string().max(500),
  token: z.string().min(1).max(500),
  exp: z.number().int(),
});

export type Session = z.infer<typeof sessionSchema>;

const b64url = {
  encode: (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url"),
  decode: (text: string) => new Uint8Array(Buffer.from(text, "base64url")),
};

/** HKDF-SHA-256: separa a chave de sessão do segredo bruto. A entropia continua vindo do SESSION_SECRET. */
async function deriveKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey("raw", enc.encode(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode("readmecraft/session/v2"), info: enc.encode("aes-256-gcm") },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export function createSessionCodec(secret: string, now: () => number = Date.now) {
  if (secret.length < 32) throw new Error("SESSION_SECRET precisa ter pelo menos 32 caracteres.");
  const keyPromise = deriveKey(secret);

  return {
    async seal(data: Omit<Session, "exp">): Promise<string> {
      const payload: Session = { ...data, exp: Math.floor(now() / 1000) + SESSION_TTL_SEC };
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyPromise, new TextEncoder().encode(JSON.stringify(payload)));
      return `${b64url.encode(iv)}.${b64url.encode(new Uint8Array(cipher))}`;
    },
    /** Retorna a sessão, ou `null` se adulterada, malformada ou expirada. */
    async open(sealed: string | undefined): Promise<Session | null> {
      if (!sealed || sealed.length > 4096) return null;
      const [ivPart, dataPart] = sealed.split(".");
      if (!ivPart || !dataPart) return null;
      try {
        const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64url.decode(ivPart) }, await keyPromise, b64url.decode(dataPart));
        const parsed = sessionSchema.safeParse(JSON.parse(new TextDecoder().decode(plain)));
        if (!parsed.success || parsed.data.exp * 1000 <= now()) return null;
        return parsed.data;
      } catch {
        return null;
      }
    },
  };
}

export type SessionCodec = ReturnType<typeof createSessionCodec>;

const cookieBase = (secure: boolean) => ({ httpOnly: true, secure, sameSite: "Lax" as const, path: "/" });

export async function writeSession(c: Context, codec: SessionCodec, data: Omit<Session, "exp">, secure: boolean) {
  setCookie(c, SESSION_COOKIE, await codec.seal(data), { ...cookieBase(secure), maxAge: SESSION_TTL_SEC });
}

export function readSession(c: Context, codec: SessionCodec): Promise<Session | null> {
  return codec.open(getCookie(c, SESSION_COOKIE));
}

export function clearSession(c: Context, secure: boolean) {
  deleteCookie(c, SESSION_COOKIE, cookieBase(secure));
}

export function writeOAuthState(c: Context, state: string, secure: boolean) {
  setCookie(c, STATE_COOKIE, state, { ...cookieBase(secure), maxAge: 10 * 60 });
}

export function takeOAuthState(c: Context, secure: boolean): string | undefined {
  const state = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, cookieBase(secure));
  return state;
}
