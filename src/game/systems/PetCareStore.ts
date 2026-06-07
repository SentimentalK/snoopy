const STORAGE_KEY = 'snoopy-modern-care';
const DAY_MS = 24 * 60 * 60 * 1000;

export type PetCareState = {
  food: number;
  lastFedAt: number | null;
};

const defaultState = (): PetCareState => ({
  food: 100,
  lastFedAt: Date.now(),
});

export class PetCareStore {
  load(): PetCareState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      return this.applyDecay(JSON.parse(raw) as PetCareState);
    } catch {
      return defaultState();
    }
  }

  save(state: PetCareState): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  feed(): PetCareState {
    const state: PetCareState = {
      food: 100,
      lastFedAt: Date.now(),
    };
    this.save(state);
    return state;
  }

  applyDecay(state: PetCareState): PetCareState {
    if (!state.lastFedAt) {
      return { food: 0, lastFedAt: null };
    }

    const elapsed = Math.max(0, Date.now() - state.lastFedAt);
    const food = Math.max(0, 100 - (elapsed / DAY_MS) * 100);
    const decayed = {
      ...state,
      food,
    };
    this.save(decayed);
    return decayed;
  }
}
