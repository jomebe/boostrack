-- Preserve legacy rows and ghosts. Only newly recorded uploads become challengeable.
ALTER TABLE leaderboard ADD COLUMN ghost_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leaderboard ADD COLUMN replay_id TEXT;
CREATE UNIQUE INDEX leaderboard_replay_id ON leaderboard(replay_id);
