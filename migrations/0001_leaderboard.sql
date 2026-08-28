CREATE TABLE leaderboard (
  track_id TEXT NOT NULL,
  racer_id TEXT NOT NULL,
  nickname TEXT NOT NULL,
  time_ms INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (track_id, racer_id)
);

CREATE INDEX leaderboard_track_time ON leaderboard (track_id, time_ms);
