// 1단계 목표: 터미널과 모델을 이어 "묻고 → 답이 흘러나오고 → 다시 묻는" 대화 루프를 돌린다.
//
//   ┌→ terminal.question() ─(질문)→ ask(model, …) ─(조각)→ terminal.print()
//   │                                                   └ 답이 끝나면 줄바꿈 (잘렸으면 알림)
//   └──────────────────────── 다음 질문 ───────────────────────┘
//   question()이 undefined(입력 끝)면 terminal.close() 하고 끝낸다.
//
// 이 테스트가 요구하는 것(직접 만든다):
// - src/interface/chat.ts — `runChat(terminal, model)`: 위 루프. 입력이 끝나면 resolve되는 Promise를 돌려준다.
//   terminal은 question·print·close만 있으면 된다(createTerminal이 만든 것이든 가짜든).
//
// main(src/main/cli.ts)은 테스트하지 않는다 — 진짜 클라이언트·진짜 터미널을 만들어 runChat에 넘기는 몇 줄뿐이고,
// `pnpm agent`로 직접 돌려 확인한다. 그래서 반복·분기 같은 "동작"은 전부 여기(runChat)에 두고 테스트한다.
//
// 1단계에서는 앞 질문을 기억하지 않는다 — 질문마다 메시지 하나짜리 대화를 새로 보낸다(기억은 2단계).
import { PassThrough } from 'node:stream';
import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import type { ModelPort } from '#/application/model-port.ts';
import { createAnthropicModel } from '#/infrastructure/anthropic-model.ts';
import { runChat } from '#/interface/chat.ts';
import { createTerminal } from '#/interface/terminal.ts';

describe('runChat', () => {
  it('질문을 모델에 보내고, 답의 글 조각을 오는 대로 찍은 뒤 줄을 바꾼다', async () => {
    const terminal = fakeTerminal(['안녕?']);
    const model = fakeModel([{ chunks: ['안', '녕'] }]);

    await runChat(terminal, model);

    expect(terminal.printed).toEqual(['안', '녕', '\n']);
  });

  it('입력이 끝날 때까지 질문마다 차례로 보낸다 — 앞 질문은 기억하지 않는다(1단계)', async () => {
    const terminal = fakeTerminal(['첫째', '둘째']);
    const model = fakeModel([{ chunks: ['1'] }, { chunks: ['2'] }]);

    await runChat(terminal, model);

    expect(model.received).toEqual([
      [{ role: 'user', content: '첫째' }],
      [{ role: 'user', content: '둘째' }],
    ]);
    expect(terminal.printed).toEqual(['1', '\n', '2', '\n']);
  });

  it('입력이 끝나면(undefined) 모델을 부르지 않고 터미널을 닫고 끝난다', async () => {
    const terminal = fakeTerminal([]);
    const model = fakeModel([]);

    await runChat(terminal, model);

    expect(model.received).toEqual([]);
    expect(terminal.closed).toBe(true);
  });

  it('답이 max_tokens에서 잘렸으면 잘렸다고 알려 준다', async () => {
    const terminal = fakeTerminal(['길게 설명해 줘']);
    const model = fakeModel([
      { chunks: ['아주 긴'], stopReason: 'max_tokens' },
    ]);

    await runChat(terminal, model);

    expect(terminal.printed.join('')).toContain('max_tokens');
  });

  // Ctrl+C 고치기: runChat은 질문마다 취소기(AbortController)를 만들어 그 신호를 ask에 넘기고,
  // terminal.onInterrupt로 Ctrl+C를 받으면 취소한다. 취소로 거부되면 정리하고 정상 종료한다.
  // "취소로 거부됐는지"는 오류 종류가 아니라 내 취소기가 취소됐는지(signal.aborted)로 안다 —
  // interface는 SDK를 import할 수 없어서 APIUserAbortError를 알 수 없다. 그래서 아래 가짜 모델은 일부러 평범한 Error로 거부한다.
  it('답이 흐르는 중에 Ctrl+C면 요청을 취소하고, 남은 질문은 보내지 않고, 터미널을 닫고 끝난다', async () => {
    const terminal = fakeTerminal(['첫째', '둘째']);
    const model = cancellableModel(() => {
      terminal.interrupt();
    });

    await runChat(terminal, model);

    expect(model.signals[0]?.aborted).toBe(true);
    expect(model.received).toHaveLength(1);
    expect(terminal.closed).toBe(true);
  });

  it('취소가 아닌 오류는 삼키지 않고 그대로 던진다', async () => {
    const terminal = fakeTerminal(['안녕?']);
    const model: ModelPort = {
      send: () => Promise.reject(new Error('네트워크 끊김')),
    };

    await expect(runChat(terminal, model)).rejects.toThrow('네트워크 끊김');
  });
});

/**
 * 첫 조각을 흘린 뒤 onStreaming을 부르고(그때 Ctrl+C를 누르는 셈), 취소 신호가 올 때까지 끝나지 않는 가짜 모델.
 * 취소되면 평범한 Error로 거부한다.
 */
function cancellableModel(onStreaming: () => void): ModelPort & {
  received: Anthropic.MessageParam[][];
  signals: (AbortSignal | undefined)[];
} {
  const received: Anthropic.MessageParam[][] = [];
  const signals: (AbortSignal | undefined)[] = [];
  return {
    received,
    signals,
    send(messages, onText, signal) {
      received.push(messages);
      signals.push(signal);
      onText('답하는 중');
      onStreaming();
      return new Promise<Anthropic.Message>((_, reject) => {
        if (signal === undefined) {
          reject(new Error('취소 신호를 받지 못했다'));
        } else if (signal.aborted) {
          reject(new Error('취소됨'));
        } else {
          signal.addEventListener('abort', () => {
            reject(new Error('취소됨'));
          });
        }
      });
    },
  };
}

// 위는 가짜로 runChat의 동작만 본다. 아래는 지금까지 만든 진짜 조각을 전부 이어 붙여 본다 —
// main이 하는 조립과 같고, 다른 점은 process.stdin/stdout 대신 가짜 스트림, 진짜 API 대신 가짜 fetch라는 것뿐이다.
describe('runChat + 진짜 터미널 + 진짜 모델 어댑터', () => {
  it('입력한 질문의 답이 프롬프트 뒤에 흘러나오고, 입력이 끝나면 끝난다', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    output.setEncoding('utf8');
    let screen = '';
    output.on('data', (chunk: string) => {
      screen += chunk;
    });
    const client = new Anthropic({
      apiKey: 'test-key',
      maxRetries: 0,
      fetch: () => Promise.resolve(sse(['안녕', '하세요'])),
    });

    input.end('안녕?\n');
    await runChat(
      createTerminal(input, output),
      createAnthropicModel(client, {
        model: 'claude-opus-5-5',
        maxTokens: 1024,
      }),
    );

    expect(screen).toBe('> 안녕하세요\n> ');
  });
});

/** 서버가 보내는 스트리밍 응답: text 블록 하나에 조각들이 차례로 온다 */
function sse(chunks: string[]): Response {
  const events = [
    {
      type: 'message_start',
      message: {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5-5',
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 1 },
      },
    },
    {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    },
    ...chunks.map(text => ({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text },
    })),
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: 5 },
    },
    { type: 'message_stop' },
  ];
  const body = events
    .map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)
    .join('');
  return new Response(body, {
    headers: { 'content-type': 'text/event-stream' },
  });
}

/**
 * 정해 둔 질문을 차례로 내주고, 다 떨어지면 undefined(입력 끝). 찍힌 글과 닫혔는지를 기록한다.
 * interrupt()는 사용자가 Ctrl+C를 누른 셈 — 진짜 터미널처럼 onInterrupt 함수를 부르고, 그 뒤 question()은 undefined다.
 */
function fakeTerminal(questions: string[]) {
  const queue = [...questions];
  const printed: string[] = [];
  let interrupted = false;
  let onInterrupt = () => {};
  const terminal = {
    printed,
    closed: false,
    question: () => Promise.resolve(interrupted ? undefined : queue.shift()),
    print: (text: string) => {
      printed.push(text);
    },
    close: () => {
      terminal.closed = true;
    },
    onInterrupt: (listener: () => void) => {
      onInterrupt = listener;
    },
    interrupt: () => {
      interrupted = true;
      onInterrupt();
    },
  };
  return terminal;
}

interface Reply {
  chunks: string[];
  stopReason?: Anthropic.StopReason;
}

/** 부를 때마다 정해 둔 답을 하나씩 흘리고, 받은 대화를 기록하는 가짜 모델 */
function fakeModel(
  replies: Reply[],
): ModelPort & { received: Anthropic.MessageParam[][] } {
  const queue = [...replies];
  const received: Anthropic.MessageParam[][] = [];
  return {
    received,
    send(messages, onText) {
      received.push(messages);
      const reply = queue.shift() ?? { chunks: [] };
      for (const chunk of reply.chunks) onText(chunk);
      return Promise.resolve(
        finalMessage(reply.chunks.join(''), reply.stopReason ?? 'end_turn'),
      );
    },
  };
}

function finalMessage(
  text: string,
  stopReason: Anthropic.StopReason,
): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: [{ type: 'text', text, citations: null }],
    stop_reason: stopReason,
    stop_sequence: null,
    stop_details: null,
    container: null,
    diagnostics: null,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation: null,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      inference_geo: null,
      output_tokens_details: null,
      server_tool_use: null,
      service_tier: null,
      speed: null,
    },
  };
}
