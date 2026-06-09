export const MODERN_GAME_WIDTH = 1376;
export const MODERN_GAME_HEIGHT = 768;
export const MODERN_FRAME_WIDTH = 688;
export const MODERN_FRAME_HEIGHT = 768;
export const MODERN_GRID_FRAMES = 8;

export const modernBackgrounds = {
  sunny: '/assets/backgrounds/sunny.jpeg',
} as const;

export const modernAmbientAnimations = [
  "brush-teeth",
  "draw",
  "reading",
  "think",
  "football",
  "sleepy",
  "tired",
  "sleep",
  "drive"
] as const;

export const modernAmbientAnimationGroups = {
  "default": [
    "brush-teeth",
    "draw",
    "reading",
    "think"
  ],
  "motion": [
    "football"
  ],
  "roof-center": [
    "sleepy",
    "tired"
  ],
  "roof-center-lower": [
    "sleep"
  ],
  "roof-edge": [
    "drive"
  ]
} as const;

export const modernEmotionAnimations = [
  "happy",
  "sad"
] as const;

export const modernActionGroups = {
  "dance": {
    "dance": "dance"
  },
  "feed": {
    "eat": "eat",
    "food": "food",
    "run": "run"
  },
  "touch": {
    "touch": "touch"
  }
} as const;

export const modernFeedAssets = {
  run: "run",
  eat: "eat",
  food: "food",
} as const;

export const modernTouchAssets = {
  touch: "touch",
} as const;

export const modernUiAssets = {
  feedButton: 'feed_button',
} as const;
