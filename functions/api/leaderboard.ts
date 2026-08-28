interface Env {
  LEADERBOARD: D1Database;
}

interface Entry {
  trackId: string;
  racerId: string;
  nickname: string;
  time: number;
}

const trackIds = new Set(['boost-valley', 'skyline-sprint']);

function response(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const trackId = new URL(request.url).searchParams.get('track');
  if (!trackId || !trackIds.has(trackId)) return response({ error: 'Unknown track.' }, 400);

  const { results } = await env.LEADERBOARD.prepare(
    'SELECT racer_id, nickname, time_ms FROM leaderboard WHERE track_id = ? ORDER BY time_ms ASC LIMIT 10',
  ).bind(trackId).all<{ racer_id: string; nickname: string; time_ms: number }>();

  return response({ entries: results.map((entry) => ({ racerId: entry.racer_id, nickname: entry.nickname, time: entry.time_ms / 1000 })) });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let entry: Entry;
  try {
    entry = await request.json<Entry>();
  } catch {
    return response({ error: 'Invalid request.' }, 400);
  }

  const racerId = entry.racerId?.trim();
  const nickname = entry.nickname?.trim().replace(/\s+/g, ' ');
  if (!trackIds.has(entry.trackId) || !racerId || !nickname || !Number.isFinite(entry.time) || entry.time < 5 || entry.time > 600) {
    return response({ error: 'Invalid leaderboard entry.' }, 400);
  }

  await env.LEADERBOARD.prepare(
    `INSERT INTO leaderboard (track_id, racer_id, nickname, time_ms, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(track_id, racer_id) DO UPDATE SET
       nickname = excluded.nickname,
       time_ms = excluded.time_ms,
       updated_at = excluded.updated_at
     WHERE excluded.time_ms < leaderboard.time_ms`,
  ).bind(entry.trackId, racerId.slice(0, 32), nickname.slice(0, 18), Math.round(entry.time * 1000), new Date().toISOString()).run();

  return response({ ok: true });
};
