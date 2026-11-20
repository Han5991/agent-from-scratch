import type { ModelPort } from '#/application/model-port.ts';
import type { createTerminal } from '#/interface/terminal.ts';
import { ask } from '#/application/ask.ts';

export const runChat = async (
  terminal: ReturnType<typeof createTerminal>,
  model: ModelPort,
) => {
  for (;;) {
    const question = await terminal.question();
    if (question === undefined) {
      terminal.close();
      return;
    }
    const message = await ask(model, question, chunk => {
      terminal.print(chunk);
    });
    terminal.print('\n');
    if (message.stop_reason === 'max_tokens') {
      terminal.print('[답이 max_tokens에서 짤렸다]\n');
    }
  }
};
