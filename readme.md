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

The current background source is `2752 x 1536`, exactly `2x` the runtime canvas. It is resized to `1376 x 768` without aspect-ratio crop.

Current visual scale target:

- Snoopy runtime scale: `0.54`
- Processed standing Snoopy visible height: roughly `330-340 px`
- Doghouse should visually read as a large environment object behind Snoopy, not as a small prop

## Source Asset Protocol

Raw assets live in `src/source`. The app does not load these files directly. They are processed into `public/assets` before dev/build.

```text
src/source/
  backgrounds/
    sunny.jpeg

  ambient/
    happy.jpeg
    reading.jpeg
    sad.jpeg
    roof-edge/
      drive.jpeg
    roof-center/
      sleepy.jpeg
    roof-center-lower/
      sleep.jpeg

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

After background removal, the processor also normalizes every animation frame to a shared visual baseline:

- Visible content is re-centered horizontally inside its frame
- Visible content bottom is aligned to `y = 719`
- Visible content is scaled to the sheet's median frame height
- This prevents Snoopy from bobbing up and down because of inconsistent AI frame placement
  and also reduces one-frame size pops from AI-generated sheets

Current runtime animation speeds:

- Ambient animations: `3 fps`
- Feed run: `7 fps`
- Feed eat: `4 fps`
- Touch: `4 fps`

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

Local dev starts only the Vite server, so run assets explicitly when source art changes:

```bash
npm run assets:modern
npm run dev
```

Production builds process assets first:

```bash
npm run build
```

Docker dev now reuses the checked-in processed assets by default. Rebuild them only when the source art changes:

```bash
npm run docker:assets
npm run docker:dev
```

Production Docker still builds the production image explicitly:

```bash
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

- If an idle animation needs a special roof placement, put it in an `ambient/` subfolder such as `roof-edge/`, `roof-center/`, or `roof-center-lower/`.
- If an ambient behavior becomes a paid/special action, move it out of `ambient/` and into an action folder.
- If weather is added, add `backgrounds/rainy.jpeg`, `backgrounds/night.jpeg`, etc.
- If play is added, create `actions/play/` and put its animation/object assets there.

### Debug Mode

Open the app with `?debug` to show layout information and a debug-only `Next animation` button.
The button advances through ambient animations in manifest order, which is useful for checking folder-based placement rules.

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
