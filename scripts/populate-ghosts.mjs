import R from '@dimforge/rapier3d-compat';
import { Vehicle, createWorld, STEP } from '../src/engine/vehicle.ts';
import { Track, COURSES } from '../src/engine/track.ts';
import { Race } from '../src/engine/race.ts';
import { drive } from '../tests/driver.mjs';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

console.log('Initializing Rapier physics...');
await R.init();

const simCache = new Map();

for (const course of COURSES) {
  console.log(`Simulating physics run for ${course.name} (${course.id})...`);
  const track = new Track(course);
  const world = createWorld(track);
  const car = new Vehicle(world);
  const race = new Race(track);
  car.reset(track);
  for (let i = 0; i < 120; i++) {
    car.step({ throttle: 0, steer: 0, brake: false });
    world.step();
    car.sync();
  }
  for (let i = 0; i < 180 * 120 && !race.finished; i++) {
    car.step(drive(track, car), track.boost(track.nearest(car.position).sample.t));
    world.step();
    car.sync();
    race.update(STEP, car.previousPosition, car.position, car.rotation);
  }
  world.free();
  console.log(`  ${course.id} done: ${race.elapsed.toFixed(3)}s, ${race.frames.length} frames`);
  simCache.set(course.id, { elapsed: race.elapsed, frames: race.frames });
}

// Fetch records with null ghost_data
const remoteJson = execSync(
  'npx wrangler d1 execute boostrack-leaderboard --remote --command="SELECT track_id, racer_id, nickname, time_ms FROM leaderboard WHERE ghost_data IS NULL"',
  { encoding: 'utf-8' }
);
const parsed = JSON.parse(remoteJson.slice(remoteJson.indexOf('[')));
const rows = parsed[0]?.results || [];
console.log(`Found ${rows.length} rows with null ghost_data.`);

for (const row of rows) {
  const courseId = row.track_id.replace(/^s4:/, '');
  const sim = simCache.get(courseId);
  if (!sim) {
    console.log(`Unknown course ${row.track_id}, skipping`);
    continue;
  }
  const targetSeconds = row.time_ms / 1000;
  const ratio = targetSeconds / sim.elapsed;
  // Downsample to every 2nd frame (~15 FPS) to stay under 60KB per record
  const sampled = sim.frames.filter((_, i) => i % 2 === 0);
  const scaledFrames = sampled.map(f => ({
    t: Math.round(f.t * ratio * 1000) / 1000,
    p: f.p.map(v => Math.round(v * 100) / 100),
    q: f.q.map(v => Math.round(v * 1000) / 1000),
  }));
  const jsonStr = JSON.stringify(scaledFrames);
  console.log(`Updating ${row.track_id} / ${row.nickname} (${row.time_ms}ms) -> ${scaledFrames.length} frames (${jsonStr.length} bytes)...`);

  // Write SQL statement to a temp file and execute
  const sql = `UPDATE leaderboard SET ghost_data = json('${jsonStr.replaceAll("'", "''")}') WHERE track_id = '${row.track_id}' AND racer_id = '${row.racer_id}';`;
  writeFileSync('temp_update.sql', sql, 'utf-8');
  execSync('npx wrangler d1 execute boostrack-leaderboard --remote --file=temp_update.sql', { stdio: 'inherit' });
}

console.log('All missing ghosts populated successfully with physics driving runs!');
