export const MODERN_GAME_WIDTH = 1376;
export const MODERN_GAME_HEIGHT = 768;
export const MODERN_FRAME_WIDTH = 688;
export const MODERN_FRAME_HEIGHT = 768;
export const MODERN_GRID_FRAMES = 8;

export const modernBackgrounds = {
  sunny: '/assets/backgrounds/sunny.jpeg',
} as const;

export const modernActors = {
  "snoopy": {
    "actionGroups": {
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
    },
    "ambientAnimationGroups": {
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
    },
    "ambientAnimations": [
      "brush-teeth",
      "draw",
      "reading",
      "think",
      "football",
      "sleepy",
      "tired",
      "sleep",
      "drive"
    ],
    "emotionAnimations": [
      "happy",
      "sad"
    ]
  }
} as const;

export const modernFeatures = {
  "letter": {
    "assets": {
      "bday": "/assets/features/letter/bday.ogg",
      "content": "/assets/features/letter/content.png",
      "letter": "/assets/features/letter/letter.png",
      "motion": "/assets/features/letter/motion.png"
    }
  }
} as const;

export const modernSnoopy = modernActors.snoopy;

export const modernAmbientAnimations = modernSnoopy.ambientAnimations;

export const modernAmbientAnimationGroups = modernSnoopy.ambientAnimationGroups;

export const modernEmotionAnimations = modernSnoopy.emotionAnimations;

export const modernActionGroups = modernSnoopy.actionGroups;

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
