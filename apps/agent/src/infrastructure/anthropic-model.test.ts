// 1단계 목표: application의 ModelPort를 Anthropic SDK로 구현한다(모델 호출 어댑터).
//
// 이 테스트가 요구하는 것(직접 만든다):
// - src/infrastructure/anthropic-model.ts — `createAnthropicModel(client, { model, maxTokens })`가 ModelPort를 돌려준다.
//   클라이언트는 받아서 쓴다. 만드는 곳은 main이다(ADR 0016).
//
// 네트워크는 타지 않는다. 진짜 SDK 클라이언트에 가짜 fetch를 끼워, API가 실제로 보내는 SSE 이벤트열을 돌려준다.
// 아래 EVENTS가 스트리밍 응답의 실제 모양이다 — message_start → 블록마다 start/delta/stop → message_delta → message_stop.
import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { createAnthropicModel } from '#/infrastructure/anthropic-model.ts';

const OPTIONS = { model: 'claude-opus-5-5', maxTokens: 1024 };
const QUESTION: Anthropic.MessageParam[] = [{ role: 'user', content: '안녕?' }];

describe('createAnthropicModel', () => {
  it('모델·max_tokens·메시지를 담아 스트리밍 요청을 보낸다', async () => {
    const { client, sent } = fakeClient(() => sse(EVENTS));

    const model = createAnthropicModel(client, OPTIONS);

    await model.send(QUESTION, () => {});

    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toMatch(/\/v1\/messages$/);
    expect(sent[0]?.body).toMatchObject({
      model: 'claude-opus-5-5',
      max_tokens: 1024,
      messages: QUESTION,
      stream: true,
    });
  });

  it('답의 글 조각(text_delta)만 순서대로 onText로 넘긴다 — thinking은 넘기지 않는다', async () => {
    const { client } = fakeClient(() => sse(EVENTS));
    const shown: string[] = [];

    await createAnthropicModel(client, OPTIONS).send(QUESTION, chunk => {
      shown.push(chunk);
    });

    expect(shown).toEqual(['안녕', '하세요']);
  });

  it('스트림이 끝나면 조각이 합쳐진 최종 메시지를 돌려준다', async () => {
    const { client } = fakeClient(() => sse(EVENTS));

    const model = createAnthropicModel(client, OPTIONS);

    const message = await model.send(QUESTION, () => {});

    expect(message.stop_reason).toBe('end_turn');
    expect(message.content.map(block => block.type)).toEqual([
      'thinking',
      'text',
    ]);
    expect(message.content[1]).toMatchObject({
      type: 'text',
      text: '안녕하세요',
    });
  });

  it('API 오류는 SDK의 타입 있는 오류로 그대로 던진다 — 삼키지 않는다', async () => {
    const { client } = fakeClient(
      () =>
        new Response(
          JSON.stringify({
            type: 'error',
            error: {
              type: 'authentication_error',
              message: 'invalid x-api-key',
            },
          }),
          { status: 401, headers: { 'content-type': 'application/json' } },
        ),
    );

    await expect(
      createAnthropicModel(client, OPTIONS).send(QUESTION, () => {}),
    ).rejects.toBeInstanceOf(Anthropic.AuthenticationError);
  });

  // Ctrl+C 고치기: send의 세 번째 인자(취소 신호)를 SDK 요청에 넘긴다 — stream(body, { signal }).
  it('취소 신호를 받으면 끝나지 않은 답이라도 기다리지 않고 APIUserAbortError로 거부한다', async () => {
    const { client } = fakeClient(init => endlessSse('안녕', init?.signal));
    const controller = new AbortController();
    const shown: string[] = [];

    const sending = createAnthropicModel(client, OPTIONS).send(
      QUESTION,
      chunk => {
        shown.push(chunk);
        controller.abort(); // 첫 조각을 받자마자 Ctrl+C를 누른 셈
      },
      controller.signal,
    );

    await expect(sending).rejects.toBeInstanceOf(Anthropic.APIUserAbortError);
    expect(shown).toEqual(['안녕']);
  });
});

/**
 * 조각 하나를 보낸 뒤 끝나지 않는 스트리밍 응답 — 서버가 아직 답을 쓰는 중인 상태.
 * 진짜 fetch처럼, 요청의 signal이 취소되면 응답 본문도 끊는다.
 */
function endlessSse(
  firstChunk: string,
  signal: AbortSignal | null | undefined,
): Response {
  const events = [
    EVENTS[0],
    {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: firstChunk },
    },
  ];
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(
          events
            .map(e => `event: ${e?.type}\ndata: ${JSON.stringify(e)}\n\n`)
            .join(''),
        ),
      );
      // close()를 부르지 않는다 — 스트림이 끝나지 않는다
      signal?.addEventListener('abort', () => {
        controller.error(signal.reason);
      });
    },
  });
  return new Response(body, {
    headers: { 'content-type': 'text/event-stream' },
  });
}

/** 서버가 스트리밍으로 보내는 이벤트열: 빈 thinking 블록 하나, 그다음 text 블록 하나 */
const EVENTS = [
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
    content_block: { type: 'thinking', thinking: '', signature: '' },
  },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'signature_delta', signature: 'sig' },
  },
  { type: 'content_block_stop', index: 0 },
  {
    type: 'content_block_start',
    index: 1,
    content_block: { type: 'text', text: '' },
  },
  {
    type: 'content_block_delta',
    index: 1,
    delta: { type: 'text_delta', text: '안녕' },
  },
  {
    type: 'content_block_delta',
    index: 1,
    delta: { type: 'text_delta', text: '하세요' },
  },
  { type: 'content_block_stop', index: 1 },
  {
    type: 'message_delta',
    delta: { stop_reason: 'end_turn', stop_sequence: null },
    usage: { output_tokens: 5 },
  },
  { type: 'message_stop' },
];

function sse(events: { type: string }[]): Response {
  const body = events
    .map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)
    .join('');
  return new Response(body, {
    headers: { 'content-type': 'text/event-stream' },
  });
}

/** 진짜 SDK 클라이언트 + 가짜 fetch. 보낸 요청을 기록하고, 정해 둔 응답을 돌려준다 */
function fakeClient(respond: (init?: RequestInit) => Response) {
  const sent: { url: string; body: unknown }[] = [];
  const client = new Anthropic({
    apiKey: 'test-key',
    maxRetries: 0,
    fetch: (input, init) => {
      const url = input instanceof Request ? input.url : input.toString();
      const body: unknown =
        typeof init?.body === 'string' ? JSON.parse(init.body) : null;
      sent.push({ url, body });
      return Promise.resolve(respond(init));
    },
  });
  return { client, sent };
}
