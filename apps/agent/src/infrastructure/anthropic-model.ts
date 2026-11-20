import type Anthropic from '@anthropic-ai/sdk';
import type { ModelPort } from '#/application/model-port.ts';

export const createAnthropicModel = (
  client: Anthropic,
  { model, maxTokens }: { model: Anthropic.Model; maxTokens: number },
): ModelPort => ({
  send: (messages, onText) => {
    const stream = client.messages.stream({
      model,
      max_tokens: maxTokens,
      messages,
    });
    stream.on('text', onText);
    return stream.finalMessage();
  },
});
