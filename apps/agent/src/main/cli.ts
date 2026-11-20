import { runChat } from '#/interface/chat.ts';
import { createTerminal } from '#/interface/terminal.ts';
import { createAnthropicModel } from '#/infrastructure/anthropic-model.ts';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const terminal = createTerminal(process.stdin, process.stdout);
const model = createAnthropicModel(client, {
  model: 'claude-haiku-5-5',
  maxTokens: 16000,
});

await runChat(terminal, model);
