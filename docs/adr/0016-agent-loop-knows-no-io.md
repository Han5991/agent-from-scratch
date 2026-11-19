---
date: 2026-11-18
status: accepted
---

# 에이전트 루프는 I/O를 모르고, 모델 SDK는 타입으로만 안다

## 결정

- `apps/agent`는 네 레이어다: application(루프·대화 기록·포트) ← infrastructure(모델 호출 어댑터·도구 구현)·interface(터미널)
  ← main(조립).
- application은 Node 코어 모듈을 import하지 못하고, `@anthropic-ai/sdk`는 타입으로만 import한다(lint가 막는다).
- SDK 클라이언트는 main에서 만들어 infrastructure에 넘기고, API 키도 main에서만 읽는다. 이 둘은 관례다 — lint는
  infrastructure의 SDK 사용을 막지 않는다.
- 메시지·도구 타입은 새로 정의하지 않고 SDK 타입을 쓴다.
- 도구는 실제 파일·셸을 건드리므로 Node 코어 모듈은 infrastructure·interface·main에 연다.

## 이유

루프가 I/O를 모르면 가짜 모델과 가짜 도구를 끼워 API 비용 없이 테스트할 수 있다. SDK 타입을 그대로 쓰면 응답의 content
블록(tool_use·thinking 등)을 잃지 않고 대화에 되돌려 넣을 수 있다 — 직접 만든 타입은 블록 종류가 늘 때마다 낡는다.
