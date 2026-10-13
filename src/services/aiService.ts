import type { RepoMetadata } from "../types/github";
import type { GeneratorEngine, GeneratorOptions, HealthStatus } from "../types/readme";

/** Mesmo valor de server/app.ts — marcador de erro anexado ao stream. */
const STREAM_ERROR_MARKER = "<!-- rc:error=";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function readError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return new ApiError(body?.error ?? `Erro HTTP ${res.status}`, res.status);
}

export async function fetchHealth(fetchImpl: typeof fetch = fetch): Promise<HealthStatus> {
  const res = await fetchImpl("/api/health");
  if (!res.ok) throw await readError(res);
  return (await res.json()) as HealthStatus;
}

export async function analyzeRepo(url: string, signal?: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<RepoMetadata> {
  const res = await fetchImpl("/api/repo/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
    signal,
  });
  if (!res.ok) throw await readError(res);
  return ((await res.json()) as { metadata: RepoMetadata }).metadata;
}

export interface StreamGenerateParams {
  metadata: RepoMetadata;
  options: GeneratorOptions;
  signal?: AbortSignal;
  /** Recebe o texto acumulado a cada bloco. */
  onText: (fullText: string) => void;
  fetchImpl?: typeof fetch;
}

export interface StreamGenerateResult {
  text: string;
  engine: GeneratorEngine;
}

/** Faz a requisição de geração e consome o ReadableStream de texto incrementalmente. */
export async function streamGenerate({ metadata, options, signal, onText, fetchImpl = fetch }: StreamGenerateParams): Promise<StreamGenerateResult> {
  const res = await fetchImpl("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ metadata, options }),
    signal,
  });
  if (!res.ok) throw await readError(res);
  if (!res.body) throw new ApiError("Resposta sem corpo.", 500);

  const engine = (res.headers.get("X-Generator-Engine") as GeneratorEngine | null) ?? "template";
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += value;
    onText(stripErrorMarker(text).text);
  }

  const { text: clean, error } = stripErrorMarker(text);
  if (error) throw new ApiError(error, 502);
  return { text: clean.trimEnd() + "\n", engine };
}

export function stripErrorMarker(text: string): { text: string; error?: string } {
  const idx = text.lastIndexOf(STREAM_ERROR_MARKER);
  if (idx === -1) return { text };
  const raw = text.slice(idx + STREAM_ERROR_MARKER.length).replace(/\s*-->\s*$/, "");
  let error: string;
  try {
    error = decodeURIComponent(raw);
  } catch {
    error = "Falha ao gerar o README.";
  }
  return { text: text.slice(0, idx).trimEnd(), error };
}

// ---------------------------------------------------------------- conta / GitHub / histórico

export interface AuthUser {
  login: string;
  avatar: string;
}

const jsonInit = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
  credentials: "same-origin",
});

async function request<T>(url: string, init: RequestInit | undefined, fetchImpl: typeof fetch): Promise<T> {
  const res = await fetchImpl(url, init);
  if (!res.ok) throw await readError(res);
  return (await res.json()) as T;
}

export async function fetchMe(fetchImpl: typeof fetch = fetch): Promise<AuthUser | null> {
  const res = await fetchImpl("/api/auth/me", { credentials: "same-origin" });
  if (!res.ok) return null;
  const body = (await res.json()) as { authenticated: boolean; user?: AuthUser };
  return body.authenticated && body.user ? body.user : null;
}

export const logout = (fetchImpl: typeof fetch = fetch) => request<{ ok: true }>("/api/auth/logout", jsonInit("POST", {}), fetchImpl);

export interface PublishResult {
  url: string;
  number: number;
  branch: string;
}

export const publishReadme = (input: { repo: string; markdown: string; bannerSvg?: string }, fetchImpl: typeof fetch = fetch) =>
  request<PublishResult>("/api/github/publish", jsonInit("POST", input), fetchImpl);
