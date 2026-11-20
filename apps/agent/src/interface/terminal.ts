import type { Readable, Writable } from 'node:stream';
import { createInterface } from 'node:readline/promises';

export const createTerminal = (input: Readable, output: Writable) => {
  const lr = createInterface({ input, output });
  const lines = lr[Symbol.asyncIterator]();
  return {
    question: async () => {
      for (;;) {
        // 쓸 만한 줄이 올 때까지 반복
        output.write('> '); // 프롬프트 (테스트는 '> '를 기대)
        const next = await lines.next(); // 다음 줄을 기다린다: { done, value }
        if (next.done) return undefined; // 입력 끝(Ctrl+D) → 끝내라는 신호
        const line = next.value.trim(); // 앞뒤 공백 떼기
        if (line !== '') return line; // 비어 있지 않으면 돌려준다
      } // 비었으면 위로 돌아가 다시 묻는다
    },
    print: (text: string) => {
      output.write(text);
    },
    close: () => lr.close(),
  };
};
