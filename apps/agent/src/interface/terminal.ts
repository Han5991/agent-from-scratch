import type { Readable, Writable } from 'node:stream';
import { createInterface } from 'node:readline/promises';

export const createTerminal = (input: Readable, output: Writable) => {
  const lr = createInterface({ input, output });
  const lines = lr[Symbol.asyncIterator]();
  let interrupted = false;
  let notifyInterrupt: (() => void) | null = null;

  lr.addListener('SIGINT', () => {
    interrupted = true;
    notifyInterrupt?.();
  });
  return {
    question: async () => {
      while (!interrupted) {
        output.write('> ');
        const next = await lines.next();
        if (next.done || interrupted) return undefined;
        const line = next.value.trim();
        if (line !== '') return line;
      }
    },
    print: (text: string) => {
      output.write(text);
    },
    close: () => lr.close(),
    onInterrupt: (listener: () => void) => {
      notifyInterrupt = listener;
    },
  };
};
