// 1단계 목표: 질문 하나를 모델에 보내고, 답을 글 조각 단위로 흘려 보여 준다.
//
// 이 테스트가 요구하는 것(직접 만든다):
// - src/application/model-port.ts — `ModelPort` 인터페이스.
//   send(messages, onText) 하나: 대화를 보내고, 글 조각이 올 때마다 onText를 부르고, 끝나면 최종 메시지를 돌려준다.
// - src/application/ask.ts — `ask(model, question, onText)`: 질문을 메시지로 만들어 모델에 보낸다.
//
// 여기서는 가짜 모델을 끼워 ask만 본다. 진짜 SDK 호출은 infrastructure/anthropic-model.test.ts가 본다.
import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { ask } from '#/application/ask.ts';
import type { ModelPort } from '#/application/model-port.ts';

describe('ask', () => {
  it('질문을 user 메시지 하나로 담아 모델에 보낸다', async () => {
    const model = fakeModel(['네']);

    await ask(model, '안녕?', () => {});

    expect(model.received).toEqual([[{ role: 'user', content: '안녕?' }]]);
  });

  it('모델이 흘리는 글 조각을 받은 순서대로 그대로 넘긴다', async () => {
    const shown: string[] = [];

    await ask(fakeModel(['안', '녕', '하세요']), '인사해 줘', chunk => {
      shown.push(chunk);
    });

    expect(shown).toEqual(['안', '녕', '하세요']);
  });

  it('모델의 최종 메시지를 그대로 돌려준다 — 호출한 쪽이 stop_reason을 볼 수 있게', async () => {
    const message = await ask(fakeModel(['안', '녕']), '인사해 줘', () => {});

    expect(message.stop_reason).toBe('end_turn');
    expect(message.content).toEqual([
      { type: 'text', text: '안녕', citations: null },
    ]);
  });
});

/** 정해 둔 조각을 순서대로 흘리고, 받은 대화를 기록하는 가짜 모델 */
function fakeModel(
  chunks: string[],
): ModelPort & { received: Anthropic.MessageParam[][] } {
  const received: Anthropic.MessageParam[][] = [];
  return {
    received,
    send(messages, onText) {
      received.push(messages);
      for (const chunk of chunks) onText(chunk);
      return Promise.resolve(finalMessage(chunks.join('')));
    },
  };
}

function finalMessage(text: string): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: [{ type: 'text', text, citations: null }],
    stop_reason: 'end_turn',
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
