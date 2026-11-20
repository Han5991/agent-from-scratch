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
