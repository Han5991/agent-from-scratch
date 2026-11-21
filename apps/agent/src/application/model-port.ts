import type Anthropic from '@anthropic-ai/sdk';

export type ModelPort = {
  send: (
    message: Anthropic.MessageParam[],
    onText: (chunk: string) => void,
    signal?: AbortSignal,
  ) => Promise<Anthropic.Message>;
};
