import { COURSES } from '../../src/engine/track.ts';
import { RANKING_SEASON, validateRankingRun } from '../../src/engine/ranking.ts';

const reply = (body: unknown, status = 200, cookie?: string) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store', ...(cookie ? { 'Set-Cookie': cookie } : {}) },
});
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const existing = request.headers.get('Cookie')?.match(/(?:^|;\s*)boostrack_racer=([a-f0-9]{32})(?:;|$)/)?.[1];
  const racer = existing ?? crypto.randomUUID().replaceAll('-', '');
  const cookie = `boostrack_racer=${racer}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${url.protocol === 'https:' ? '; Secure' : ''}`;
  try {
    if (request.method === 'GET') {
      const track = url.searchParams.get('track');
      if (!COURSES.some(c => c.id === track)) return reply({ error: '코스를 찾을 수 없습니다.' }, 400);
      const id = `${RANKING_SEASON}:${track}`;
      const replay = url.searchParams.get('replay');
      if (url.searchParams.has('ghost_rank')) return reply({error:'랭킹을 새로고침해 원본 고스트를 선택해 주세요.'},409);
      if (replay) {
        if (!/^[a-f0-9-]{36}$/.test(replay)) return reply({error:'잘못된 고스트입니다.'},400);
        const row = await env.LEADERBOARD.prepare(
          'SELECT nickname, time_ms, ghost_data, (SELECT COUNT(*)+1 FROM leaderboard b WHERE b.track_id=a.track_id AND b.time_ms<a.time_ms) AS rank FROM leaderboard a WHERE track_id=? AND replay_id=? AND ghost_version=1',
        ).bind(id,replay).first<{nickname:string; time_ms:number;ghost_data:string;rank:number}>();
        if (!row) return reply({error:'원본 고스트가 없거나 기록이 갱신됐습니다. 랭킹을 새로고침해 주세요.'},404);
        const ghost = JSON.parse(row.ghost_data);
        return reply({nickname:row.nickname,time_ms:row.time_ms,rank:row.rank,frames:ghost.frames,splits:ghost.splits,replay},200,cookie);
      }
      const { results } = await env.LEADERBOARD.prepare(
        'SELECT nickname, time_ms, racer_id = ? AS mine, CASE WHEN ghost_version=1 THEN replay_id ELSE NULL END AS replay, (SELECT COUNT(*)+1 FROM leaderboard b WHERE b.track_id=a.track_id AND b.time_ms<a.time_ms) AS rank FROM leaderboard a WHERE track_id=? ORDER BY time_ms, updated_at, racer_id LIMIT 50',
      ).bind(racer,id).all();
      const mine = await env.LEADERBOARD.prepare(
        'SELECT nickname, time_ms, (SELECT COUNT(*)+1 FROM leaderboard b WHERE b.track_id=a.track_id AND b.time_ms<a.time_ms) AS rank FROM leaderboard a WHERE track_id=? AND racer_id=?',
      ).bind(id,racer).first();
      return reply({entries:results,mine,season:RANKING_SEASON},200,cookie);
    }
    if (request.method !== 'POST') return reply({error:'지원하지 않는 요청입니다.'},405);
    const origin = request.headers.get('Origin');
    const local = ['127.0.0.1','localhost'].includes(url.hostname) && ['http://127.0.0.1:5173','http://localhost:5173'].includes(origin ?? '');
    if ((origin !== url.origin && !local) || !request.headers.get('Content-Type')?.startsWith('application/json')) return reply({error:'잘못된 요청 출처입니다.'},403);
    if (!existing) return reply({error:'랭킹을 먼저 열어 주세요.'},401);
    const reader = request.body?.getReader();
    if (!reader) return reply({error:'기록이 없습니다.'},400);
    let text='',size=0;
    const decoder=new TextDecoder();
    for (;;) {
      const {value,done}=await reader.read(); if(done)break;
      size+=value.byteLength;
      if(size>6_000_000){await reader.cancel();return reply({error:'주행 데이터가 너무 큽니다.'},413);}
      text+=decoder.decode(value,{stream:true});
    }
    text+=decoder.decode();
    let run:unknown;
    try{run=JSON.parse(text);}catch{return reply({error:'잘못된 기록 형식입니다.'},400);}
    if(!validateRankingRun(run))return reply({error:'실제 주행 데이터 검증에 실패했습니다. 새 버전에서 복귀 없이 완주해 주세요.'},400);
    // Original sampled transforms/timestamps are stored unchanged. No synthesized fallback.
    const ghost=JSON.stringify({frames:run.frames,splits:run.splits});
    if(new TextEncoder().encode(ghost).byteLength>1_800_000)return reply({error:'고스트 저장 용량을 초과했습니다. 더 짧은 주행을 등록해 주세요.'},413);
    const result=await env.LEADERBOARD.prepare(
      `INSERT INTO leaderboard (track_id,racer_id,nickname,time_ms,updated_at,ghost_data,ghost_version,replay_id) VALUES (?,?,?,?,?,?,1,?)
       ON CONFLICT(track_id,racer_id) DO UPDATE SET nickname=excluded.nickname,time_ms=excluded.time_ms,updated_at=excluded.updated_at,ghost_data=excluded.ghost_data,ghost_version=1,replay_id=excluded.replay_id
       WHERE excluded.time_ms<=leaderboard.time_ms`,
    ).bind(`${RANKING_SEASON}:${run.track}`,racer,run.nickname,Math.round(run.time*1000),new Date().toISOString(),ghost,crypto.randomUUID()).run();
    return reply({ok:true,updated:result.meta.changes>0},200,cookie);
  } catch(error) {
    console.error(JSON.stringify({event:'leaderboard_error',message:error instanceof Error?error.message:'Unknown error'}));
    return reply({error:'랭킹 서버에 연결하지 못했습니다. 다시 시도해 주세요.'},503);
  }
};
