# Snoopy Pet Runtime Technical Design

## Goal

This project is now a modern illustrated pet scene runtime. The old pixel-art assets, old six-button UI, status bars, Woodstock, ball, effects, and generic action timeline have been removed from the active app.

The current minimum product is:

- Full-scene illustrated background
- Snoopy ambient animations
- One illustrated feed button
- Feed sequence
- Tap Snoopy sequence
- Food value that decays from `100` to `0` over 24 hours
- Sad state when food reaches `0`

## Runtime Size

- Logical canvas: `1376 x 768`
- Aspect ratio: `16:9`
- Render mode: normal antialiased illustration, not pixel art
- Phaser scale mode: `FIT`

## Source Asset Protocol

Raw assets live in `src/source`. The app does not load these files directly. They are processed into `public/assets` before dev/build.

```text
src/source/
  backgrounds/
    sunny.jpeg

  ambient/
    drive.jpeg
    happy.jpeg
    reading.jpeg
    sad.jpeg
    sleep.jpeg
    sleepy.jpeg

  actions/
    feed/
      run.jpeg
      eat.jpeg
      food.jpeg

    touch/
      touch.jpeg

  ui/
    feed_button.jpeg
```

### Animation Sheets

Most animation source files use this format:

- File type: `.jpeg`
- Source size: `2752 x 1536`
- Grid: `4 columns x 2 rows`
- Frames: `8`
- Frame size: `688 x 768`
- Background: white or near-white

The asset processor removes only the edge-connected white background from each frame, preserving white areas inside Snoopy.

### Button Sheet

The feed button source uses this format:

- File: `src/source/ui/feed_button.jpeg`
- Source size: `1376 x 768`
- Grid: `2 columns x 1 row`
- Frames: `2`
- Frame size: `688 x 768`
- Frame `0`: normal
- Frame `1`: pressed

The asset processor removes edge-connected checker/white background.

### Single Object

The food bowl is currently a single object:

- File: `src/source/actions/feed/food.jpeg`
- Source size: `2752 x 1536`
- Processed as a transparent PNG object, not as an animation sheet

## Processed Assets

Run:

```bash
npm run assets:modern
```

This writes:

```text
public/assets/
  backgrounds/sunny.jpeg
  ambient/*.png
  actions/feed/*.png
  actions/touch/*.png
  ui/feed_button.png
```

It also generates:

```text
src/game/data/generatedModernAssets.ts
```

Do not edit `generatedModernAssets.ts` by hand. It is recreated by `scripts/process-modern-assets.mjs`.

## Build Flow

Both dev and production builds process assets first:

```bash
npm run dev
npm run build
```

Docker uses the same scripts:

```bash
npm run docker:dev
npm run docker:prod
```

## Extensible Asset Categories

The runtime uses folder semantics:

- `ambient/`: animations that can play freely while the pet is idle
- `actions/feed/`: assets required for feeding
- `actions/touch/`: assets required for tapping/petting Snoopy
- `backgrounds/`: scene backgrounds; future weather/time-of-day variants go here
- `ui/`: image-based UI controls

Future behavior should be added by moving or adding files to semantic folders, then extending the runtime rules around those folders.

Examples:

- If `drive` becomes a paid/special action, move it out of `ambient/` and into an action folder.
- If weather is added, add `backgrounds/rainy.jpeg`, `backgrounds/night.jpeg`, etc.
- If play is added, create `actions/play/` and put its animation/object assets there.

## Pet Care State

Current persisted state:

```ts
type PetCareState = {
  food: number;
  lastFedAt: number | null;
};
```

Food decay:

```text
food = max(0, 100 - elapsedSinceLastFeed / 24h * 100)
```

Rules:

- Feeding sets `food = 100`
- Opening the game recalculates food from `lastFedAt`
- If `food <= 0`, ambient selection is forced to `sad`
- If `food > 0`, ambient selection chooses randomly from non-sad ambient animations

## Runtime Modes

Current scene modes:

```text
ambient
feeding
touching
```

### Ambient

- Snoopy stands at home position
- A random ambient animation loops
- Every 7-12 seconds, a new ambient animation may be selected
- If food is `0`, `sad` is selected instead

### Feeding

Triggered by the feed button.

```text
button pressed
food bowl appears
Snoopy plays run
Snoopy moves to food target
food bowl hides
Snoopy plays eat
food resets to 100
Snoopy plays happy
return to ambient
```

During feeding:

- The feed button is disabled
- Snoopy touch is ignored

### Touching

Triggered by clicking/tapping Snoopy.

```text
Snoopy plays touch
Snoopy plays happy
return to ambient
```

During touching:

- The feed button is disabled
- Feeding cannot start

## Active Runtime Files

```text
src/game/config.ts
src/game/scenes/BootScene.ts
src/game/scenes/PetScene.ts
src/game/systems/PetCareStore.ts
src/game/data/generatedModernAssets.ts
src/main.ts
src/style.css
scripts/process-modern-assets.mjs
```

Everything else from the old pixel-art implementation has been removed from the active app.
