// 1단계 목표: 터미널에서 질문을 한 줄 받고, 답의 글 조각을 오는 대로 찍는다.
//
//   사용자 ─(한 줄 입력)→ question() ─→ ask ─→ 모델 ─(조각)→ print() ─→ 화면
//
// 이 테스트가 요구하는 것(직접 만든다):
// - src/interface/terminal.ts — `createTerminal(input, output)`이 아래 셋을 가진 객체를 돌려준다.
//   - question(): "> "를 띄우고 한 줄을 기다려 돌려준다. 입력이 끝나면(Ctrl+D) undefined — 프로그램을 끝내라는 신호다.
//   - print(text): 받은 글을 줄바꿈 없이 그대로 쓴다. 조각이 이어 붙어 한 문장이 된다.
//   - close(): 입력 대기를 끝낸다.
//
// input·output을 process.stdin/stdout에 묶지 않고 받아서 쓴다 — 실행할 때는 main이 진짜 터미널을 넘기고,
// 테스트는 PassThrough(손으로 써 넣고 읽어 낼 수 있는 가짜 스트림)를 넘긴다. 모델 어댑터가 client를 받는 것과 같은 이유다.
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createTerminal } from '#/interface/terminal.ts';

describe('createTerminal', () => {
  it('"> "를 띄우고, 입력한 한 줄을 돌려준다', async () => {
    const { input, terminal, written } = setup();

    input.write('안녕?\n');

    expect(await terminal.question()).toBe('안녕?');
    expect(written()).toBe('> ');
  });

  it('앞뒤 공백은 떼고, 빈 줄은 건너뛰고 다음 줄을 기다린다', async () => {
    const { input, terminal } = setup();

    input.write('   \n  안녕?  \n');

    expect(await terminal.question()).toBe('안녕?');
  });

  it('입력이 끝나면(Ctrl+D) undefined를 돌려준다 — 끝내라는 신호', async () => {
    const { input, terminal } = setup();

    input.end();

    expect(await terminal.question()).toBeUndefined();
  });

  it('여러 번 물으면 한 줄씩 차례로 돌려준다', async () => {
    const { input, terminal } = setup();

    input.write('첫째\n둘째\n');

    expect(await terminal.question()).toBe('첫째');
    expect(await terminal.question()).toBe('둘째');
  });

  it('print는 줄바꿈 없이 그대로 쓴다 — 조각이 이어 붙는다', () => {
    const { terminal, written } = setup();

    terminal.print('안녕');
    terminal.print('하세요');

    expect(written()).toBe('안녕하세요');
  });
});

// Ctrl+C 고치기: 터미널이 Ctrl+C를 받으면
// - onInterrupt(listener)로 걸어 둔 함수를 부른다 — runChat이 진행 중인 요청을 취소하는 데 쓴다.
// - 그 뒤 question()은 쌓여 있던 줄(예: 붙여 넣은 여러 줄)을 버리고 바로 undefined를 돌려준다.
// readline은 진짜 터미널일 때만 Ctrl+C(\x03)를 키로 해석한다. 그래서 여기서는 output에 isTTY를 붙여 터미널인 척한다.
// 진짜 터미널에서는 Enter가 \r로 들어온다.
describe('createTerminal — Ctrl+C', () => {
  it('양성 대조 — 터미널인 척해도 Ctrl+C 전에는 평소처럼 한 줄씩 받는다', async () => {
    const { input, terminal } = setupTty();

    input.write('안녕?\r');

    expect(await terminal.question()).toBe('안녕?');
  });

  it('Ctrl+C를 누르면 onInterrupt에 걸어 둔 함수를 부른다', async () => {
    const { input, terminal } = setupTty();
    let interrupts = 0;
    terminal.onInterrupt(() => {
      interrupts += 1;
    });

    input.write(CTRL_C);
    await tick();

    expect(interrupts).toBe(1);
  });

  it('Ctrl+C 뒤에는 쌓여 있던 줄을 버리고 undefined를 돌려준다', async () => {
    const { input, terminal } = setupTty();

    input.write('첫째\r둘째\r');
    input.write(CTRL_C);
    await tick();

    expect(await terminal.question()).toBeUndefined();
  });
});

const CTRL_C = '\x03';

/** 쌓인 입력이 처리될 때까지 한 박자 기다린다 */
const tick = () =>
  new Promise<void>(resolve => {
    setImmediate(resolve);
  });

/** 진짜 터미널인 척하는 가짜 스트림을 끼운 터미널 */
function setupTty() {
  const input = new PassThrough();
  const output = Object.assign(new PassThrough(), { isTTY: true });
  output.resume();
  const terminal = createTerminal(input, output);
  return { input, terminal };
}

/** 가짜 입출력 스트림을 끼운 터미널. written()은 지금까지 output에 쓰인 글 전체 */
function setup() {
  const input = new PassThrough();
  const output = new PassThrough();
  output.setEncoding('utf8');
  let written = '';
  output.on('data', (chunk: string) => {
    written += chunk;
  });
  const terminal = createTerminal(input, output);
  return { input, terminal, written: () => written };
}
