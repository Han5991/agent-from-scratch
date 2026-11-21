import type { ModelPort } from '#/application/model-port.ts';
import type { createTerminal } from '#/interface/terminal.ts';
import { ask } from '#/application/ask.ts';

export const runChat = async (
  terminal: ReturnType<typeof createTerminal>,
  model: ModelPort,
) => {
  while (true) {
    const question = await terminal.question();
    if (question === undefined) {
      terminal.close();
      break;
    }
    const controller = new AbortController();
    terminal.onInterrupt(() => controller.abort());
    try {
      const message = await ask(
        model,
        question,
        chunk => {
          terminal.print(chunk);
        },
        controller.signal,
      );
      terminal.print('\n');
      if (message.stop_reason === 'max_tokens') {
        terminal.print('[답이 max_tokens에서 잘렸다]\n');
      }
    } catch (error) {
      terminal.print('\n');
      if (!controller.signal.aborted) {
        throw error;
      }
    }
  }
};
