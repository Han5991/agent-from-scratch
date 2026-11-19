import {
  base,
  layers,
  noNodeBuiltins,
  TEST_FILES,
  typeChecked,
} from '@agent-from-scratch/eslint-config';
import { defineConfig } from 'eslint/config';

const SDK = '@anthropic-ai/sdk';

// 에이전트 = 모델 호출 루프 + 도구. 의존은 바깥 → 안쪽으로만(ADR 0001·0016).
// 루프(application)는 I/O를 모른다 — 가짜 모델·가짜 도구를 끼워 API 호출 없이 테스트하려고.
export default defineConfig([
  base,
  // 기다리지 않은 promise·any 흘리기를 잡는다 — 루프와 도구는 전부 비동기이고, 도구 입력은 모델이 만든 unknown이다
  typeChecked(import.meta.dirname, ['src/**/*.ts']),
  {
    files: ['src/application/**/*.ts'],
    ignores: TEST_FILES,
    rules: {
      ...noNodeBuiltins,
      // SDK는 타입(메시지·도구 정의)만 쓴다. 클라이언트를 만들고 부르는 일은 infrastructure·main의 몫이다
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: SDK,
              allowTypeImports: true,
              message:
                '루프는 SDK의 타입만 안다(import type). 모델 호출은 포트 뒤(infrastructure)에 둔다.',
            },
          ],
        },
      ],
    },
  },
  layers(import.meta.dirname, [
    // 루프 · 대화 기록 · 포트(모델·도구·승인 인터페이스)
    { type: 'application', pattern: 'src/application', externals: [SDK] },
    // 포트 구현: 모델 호출 어댑터, 도구(파일·셸). 도구 입력 검증은 zod
    {
      type: 'infrastructure',
      pattern: 'src/infrastructure',
      allow: ['application'],
      externals: [SDK, `${SDK}/**`, 'zod'],
      core: true,
    },
    // 터미널 입출력
    {
      type: 'interface',
      pattern: 'src/interface',
      allow: ['application'],
      core: true,
    },
    // 조립(composition root) — API 키·작업 폴더를 읽고 SDK 클라이언트를 만드는 유일한 곳
    {
      type: 'main',
      pattern: 'src/main',
      allow: ['application', 'infrastructure', 'interface'],
      externals: [SDK, 'zod'],
      core: true,
    },
  ]),
]);
