import type { ModelPort } from '#/application/model-port.ts';
import type Anthropic from '@anthropic-ai/sdk';

export const ask = (
  model: ModelPort,
  message: string,
  callback: Parameters<ModelPort['send']>[1],
  signal?: AbortSignal,
): Promise<Anthropic.Message> => {
  return model.send(
    [
      {
        role: 'user',
        content: message,
      },
    ],
    callback,
    signal,
  );
};
