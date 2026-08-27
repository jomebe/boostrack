import { GhostRun } from '../race/Ghost';

export interface RacerProfile {
  id: string;
  nickname: string;
  createdAt: string;
  records: Record<string, GhostRun>;
}

const PROFILE_KEY = 'boostrack:racer-profile:v1';

function createProfile(): RacerProfile {
  const suffix = crypto.getRandomValues(new Uint32Array(1))[0].toString(36).slice(-5).toUpperCase();
  return {
    id: `RACER-${suffix}`,
    nickname: `Racer ${Math.floor(100 + Math.random() * 900)}`,
    createdAt: new Date().toISOString(),
    records: {},
  };
}

export class ProfileStore {
  private profile: RacerProfile;

  constructor() {
    this.profile = this.read();
    this.migrateLegacyBoostValleyRecord();
  }

  get(): RacerProfile {
    return this.profile;
  }

  rename(nickname: string): RacerProfile {
    const cleaned = nickname.trim().replace(/\s+/g, ' ').slice(0, 18);
    if (cleaned) this.profile.nickname = cleaned;
    this.save();
    return this.profile;
  }

  best(trackId: string): GhostRun | null {
    return this.profile.records[trackId] ?? null;
  }

  saveBest(trackId: string, run: GhostRun): boolean {
    const current = this.best(trackId);
    if (current && current.time <= run.time) return false;
    this.profile.records[trackId] = run;
    this.save();
    return true;
  }

  private read(): RacerProfile {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as RacerProfile;
        if (parsed.id && parsed.nickname && parsed.records) return parsed;
      }
    } catch {
      // A fresh profile is safer than failing to start the game on malformed local data.
    }
    const profile = createProfile();
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    return profile;
  }

  private migrateLegacyBoostValleyRecord(): void {
    if (this.profile.records['boost-valley']) return;
    try {
      const raw = localStorage.getItem('boostrack:boost-valley:pb');
      if (!raw) return;
      this.profile.records['boost-valley'] = JSON.parse(raw) as GhostRun;
      localStorage.removeItem('boostrack:boost-valley:pb');
      this.save();
    } catch {
      // Ignore obsolete malformed data.
    }
  }

  private save(): void {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(this.profile));
  }
}
