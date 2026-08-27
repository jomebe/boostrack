# BOOSTRACK

브라우저에서 바로 플레이하는 로우폴리 3D 타임어택 레이싱 MVP입니다.

**플레이:** https://boostrack.pages.dev/

## 실행

```bash
npm install
npm run dev
```

Vite가 출력하는 로컬 주소를 브라우저에서 여세요.

## 조작

- `WASD` / 방향키: 가속, 브레이크, 조향
- `Shift`: NITRO BOOST
- `Space`: 핸드브레이크 / 드리프트
- `T`: 최근 체크포인트 복귀
- `R`: 처음부터 즉시 재시작
- `C`: CHASE / FAR / HOOD 카메라 전환
- `Esc`: 일시정지

## MVP 기능

- 프리미티브 지오메트리 기반 미래형 스포츠카와 로우폴리 환경
- 고속 조향 감소, 횡접지, 드리프트, 점프, 착지, 벽 충돌을 포함한 아케이드 주행
- 스킬 기반 BOOST 충전, BOOST PAD, 속도 파티클, FOV 및 카메라 피드백
- BOOST VALLEY 단일 트랙과 순차 체크포인트 3개
- 밀리초 타이머, 체크포인트 split, CLEAN 콤보, 즉시 복구
- localStorage 개인 최고 기록과 보간 재생되는 PB Ghost
- 로컬 레이서 계정: 닉네임, 고유 레이서 ID, 맵별 PB와 Ghost 저장
- BOOST VALLEY와 SKYLINE SPRINT의 두 개의 공중 트랙 선택
- 트랙 이탈 시 자동 복구하지 않고 추락하며 `T` / `R`로 원하는 위치에 복귀
- 사운드 파일 없이 Web Audio로 생성되는 엔진/BOOST/UI 피드백

Supabase 온라인 리더보드, 온라인 Ghost, 트랙 에디터, 실시간 멀티플레이는 플레이어블 코어 이후 단계로 남겨두었습니다.
