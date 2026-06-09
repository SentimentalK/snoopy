import { modernSnoopy } from '../data/generatedModernAssets';

export type FrameRange = readonly [number, number];

export type SnoopyMicroAction = {
  name: string;
  frames: readonly number[];
  chance: number;
  cooldown: FrameRange;
  frameDuration?: number;
};

export type SnoopyActivityDefinition = {
  key: string;
  textureKey: string;
  anchorFrames: readonly number[];
  exitFrames: readonly number[];
  holdTime: FrameRange;
  dwellTime: FrameRange;
  microActions: readonly SnoopyMicroAction[];
  legacyLoop?: boolean;
  randomSelectable?: boolean;
};

const seconds = (min: number, max: number): FrameRange => [min * 1000, max * 1000];

const restfulDefaults = {
  anchorFrames: [0, 1, 7],
  exitFrames: [0, 1, 7],
  holdTime: seconds(3, 12),
  dwellTime: seconds(55, 150),
} as const;

const lightBlink = {
  name: 'blink',
  frames: [1, 2, 3, 4, 1],
  chance: 0.35,
  cooldown: seconds(5, 18),
  frameDuration: 150,
} as const;

const softMotion = {
  name: 'settle',
  frames: [0, 1, 2, 1, 0],
  chance: 0.28,
  cooldown: seconds(8, 22),
  frameDuration: 180,
} as const;

const ACTIVITY_OVERRIDES: Record<string, Omit<SnoopyActivityDefinition, 'key' | 'textureKey'>> = {
  reading: {
    ...restfulDefaults,
    microActions: [
      lightBlink,
      {
        name: 'turnPage',
        frames: [1, 5, 6, 7, 1],
        chance: 0.12,
        cooldown: seconds(18, 48),
        frameDuration: 180,
      },
    ],
  },
  draw: {
    anchorFrames: [0, 1, 7],
    exitFrames: [0, 1, 7],
    holdTime: seconds(3, 10),
    dwellTime: seconds(45, 130),
    microActions: [
      lightBlink,
      {
        name: 'drawStroke',
        frames: [1, 5, 6, 7, 1],
        chance: 0.22,
        cooldown: seconds(8, 24),
        frameDuration: 170,
      },
    ],
  },
  think: {
    anchorFrames: [0, 1, 6, 7],
    exitFrames: [0, 1, 7],
    holdTime: seconds(4, 14),
    dwellTime: seconds(40, 120),
    microActions: [
      lightBlink,
      {
        name: 'ponder',
        frames: [1, 2, 3, 4, 5, 6, 7, 1],
        chance: 0.2,
        cooldown: seconds(10, 30),
        frameDuration: 180,
      },
    ],
  },
  'brush-teeth': {
    anchorFrames: [0, 1, 7],
    exitFrames: [0, 1, 7],
    holdTime: seconds(2, 6),
    dwellTime: seconds(20, 55),
    microActions: [
      {
        name: 'brush',
        frames: [1, 2, 3, 4, 5, 6, 7, 1],
        chance: 0.55,
        cooldown: seconds(3, 9),
        frameDuration: 150,
      },
    ],
  },
  sleepy: {
    anchorFrames: [0, 1, 7],
    exitFrames: [0, 1, 7],
    holdTime: seconds(5, 16),
    dwellTime: seconds(50, 140),
    microActions: [
      {
        name: 'nod',
        frames: [1, 2, 3, 4, 5, 6, 7, 1],
        chance: 0.24,
        cooldown: seconds(12, 34),
        frameDuration: 220,
      },
    ],
  },
  tired: {
    anchorFrames: [0, 1, 7],
    exitFrames: [0, 1, 7],
    holdTime: seconds(5, 18),
    dwellTime: seconds(45, 130),
    microActions: [
      {
        name: 'sigh',
        frames: [1, 2, 3, 4, 5, 6, 7, 1],
        chance: 0.2,
        cooldown: seconds(14, 38),
        frameDuration: 210,
      },
    ],
  },
  sleep: {
    anchorFrames: [0, 1, 7],
    exitFrames: [0, 1, 7],
    holdTime: seconds(7, 20),
    dwellTime: seconds(70, 180),
    randomSelectable: false,
    microActions: [
      {
        name: 'breathe',
        frames: [0, 1, 2, 3, 4, 3, 2, 1, 0],
        chance: 0.4,
        cooldown: seconds(8, 24),
        frameDuration: 230,
      },
    ],
  },
  football: {
    anchorFrames: [0],
    exitFrames: [0],
    holdTime: seconds(0, 0),
    dwellTime: seconds(0, 0),
    microActions: [],
    legacyLoop: true,
  },
  drive: {
    anchorFrames: [0],
    exitFrames: [0],
    holdTime: seconds(0, 0),
    dwellTime: seconds(18, 42),
    microActions: [],
    legacyLoop: true,
  },
};

const fallbackActivity = (key: string): SnoopyActivityDefinition => ({
  key,
  textureKey: `ambient:${key}`,
  ...restfulDefaults,
  microActions: [softMotion],
});

export const SNOOPY_ACTIVITY_DEFINITIONS: Record<string, SnoopyActivityDefinition> =
  Object.fromEntries(
    modernSnoopy.ambientAnimations.map((key) => [
      key,
      {
        key,
        textureKey: `ambient:${key}`,
        ...(ACTIVITY_OVERRIDES[key] ?? fallbackActivity(key)),
      },
    ]),
  );

export const SNOOPY_ACTIVITY_KEYS: readonly string[] = modernSnoopy.ambientAnimations;
export const SNOOPY_RANDOM_ACTIVITY_KEYS: readonly string[] = SNOOPY_ACTIVITY_KEYS.filter((key) => (
  SNOOPY_ACTIVITY_DEFINITIONS[key]?.randomSelectable !== false
));
