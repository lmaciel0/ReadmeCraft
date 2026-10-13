import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "../src/prompts/systemPrompts";
import { buildUserPrompt } from "../src/prompts/templatePrompts";
import type { RepoMetadata } from "../src/types/github";
import type { GeneratorOptions } from "../src/types/readme";

export const DEFAULT_MODEL = "claude-haiku-4-5";

export class GenerationRefusedError extends Error {
  constructor(category: string | null | undefined) {
    super(`O modelo recusou a solicitação${category ? ` (${category})` : ""}.`);
    this.name = "GenerationRefusedError";
  }
}

/** Há credenciais da Anthropic disponíveis? (chave de API ou token OAuth). */
export function hasAnthropicCredentials(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY?.trim() || env.ANTHROPIC_AUTH_TOKEN?.trim());
}

/**
 * Gera o README com Claude via streaming, entregando apenas os deltas de texto.
 * A chave nunca sai do servidor: o cliente só recebe o markdown.
 */
export async function* streamReadmeWithClaude(
  metadata: RepoMetadata,
  options: GeneratorOptions,
  { client = new Anthropic(), model = DEFAULT_MODEL, signal }: { client?: Anthropic; model?: string; signal?: AbortSignal } = {},
): AsyncGenerator<string> {
  // Haiku 4.5 não suporta thinking adaptativo, `effort` nem fallback no servidor: requisição simples.
  const stream = client.messages.stream(
    {
      model,
      max_tokens: options.onlySection ? 6000 : 16000,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: buildUserPrompt(metadata, options) }],
    },
    { signal },
  );

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }

  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") {
    throw new GenerationRefusedError(final.stop_details?.category);
  }
}
