export const MODERN_GAME_WIDTH = 1376;
export const MODERN_GAME_HEIGHT = 768;
export const MODERN_FRAME_WIDTH = 688;
export const MODERN_FRAME_HEIGHT = 768;
export const MODERN_GRID_FRAMES = 8;

export const modernBackgrounds = {
  sunny: '/assets/backgrounds/sunny.jpeg',
} as const;

export const modernAmbientAnimations = [
  "happy",
  "reading",
  "sad",
  "sleepy",
  "sleep",
  "drive"
] as const;

export const modernAmbientAnimationGroups = {
  "default": [
    "happy",
    "reading",
    "sad"
  ],
  "roof-center": [
    "sleepy"
  ],
  "roof-center-lower": [
    "sleep"
  ],
  "roof-edge": [
    "drive"
  ]
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
