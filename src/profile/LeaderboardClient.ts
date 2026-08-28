export interface LeaderboardEntry {
  racerId: string;
  nickname: string;
  time: number;
}

export interface LeaderboardSubmission extends LeaderboardEntry {
  trackId: string;
}

export class LeaderboardClient {
  async fetch(trackId: string): Promise<LeaderboardEntry[]> {
    const response = await window.fetch(`/api/leaderboard?track=${encodeURIComponent(trackId)}`);
    if (!response.ok) throw new Error('Leaderboard request failed.');
    const data = await response.json() as { entries: LeaderboardEntry[] };
    return data.entries;
  }

  async submit(entry: LeaderboardSubmission): Promise<void> {
    const response = await window.fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    if (!response.ok) throw new Error('Leaderboard submission failed.');
  }
}
