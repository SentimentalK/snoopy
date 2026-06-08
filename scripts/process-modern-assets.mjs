import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { PNG } from 'pngjs';

const ROOT = process.cwd();
const SOURCE_DIR = path.join(ROOT, 'src/source');
const OUTPUT_DIR = path.join(ROOT, 'public/assets');
const GENERATED_MANIFEST = path.join(ROOT, 'src/game/data/generatedModernAssets.ts');

const GAME_WIDTH = 1376;
const GAME_HEIGHT = 768;
const FRAME_WIDTH = 688;
const FRAME_HEIGHT = 768;
const GRID_COLUMNS = 4;
const GRID_ROWS = 2;
const GRID_FRAMES = GRID_COLUMNS * GRID_ROWS;
const FRAME_BASELINE_Y = 720;
const SLEEP_BODY_BASELINE_Y = 520;
const MIN_BOUNDING_COMPONENT_PIXELS = 8;
const GREEN_SCREEN_HEX = '#00ff00';

const ensureDir = (dir) => fs.mkdirSync(dir, { recursive: true });

const toKey = (filePath) => path.basename(filePath, path.extname(filePath));

const readImage = async (filePath) => {
  const { data, info } = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const png = new PNG({ width: info.width, height: info.height });
  Buffer.from(data).copy(png.data);
  return png;
};

const writePng = (filePath, png) => {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, PNG.sync.write(png));
};

const pixelIndex = (png, x, y) => (y * png.width + x) * 4;

const isWhiteBackground = (r, g, b) => r >= 238 && g >= 238 && b >= 238;

const isGreenScreenBackground = (r, g, b) => (
  g >= 180
  && r <= 96
  && b <= 96
  && g - Math.max(r, b) >= 90
);

const isCheckerBackground = (r, g, b) => {
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  return max - min <= 36 && min >= 80 && max <= 245;
};

const hasGreenScreenBackground = (png, bounds) => {
  const { x, y, width, height } = bounds;
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      const i = pixelIndex(png, px, py);
      if (png.data[i + 3] === 0) continue;
      if (isGreenScreenBackground(png.data[i], png.data[i + 1], png.data[i + 2])) {
        return true;
      }
    }
  }
  return false;
};

const resolveBackgroundMode = (png, bounds, fallbackMode) => (
  hasGreenScreenBackground(png, bounds) ? 'green' : fallbackMode
);

const removeGreenScreenBackground = (png, bounds) => {
  const { x, y, width, height } = bounds;
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      const i = pixelIndex(png, px, py);
      if (png.data[i + 3] === 0) continue;
      if (!isGreenScreenBackground(png.data[i], png.data[i + 1], png.data[i + 2])) continue;
      png.data[i] = 0;
      png.data[i + 1] = 0;
      png.data[i + 2] = 0;
      png.data[i + 3] = 0;
    }
  }
};

const removeBackground = (png, bounds, fallbackMode) => {
  const mode = resolveBackgroundMode(png, bounds, fallbackMode);
  if (mode === 'green') {
    removeGreenScreenBackground(png, bounds);
    return;
  }
  removeConnectedBackground(png, bounds, mode);
};

const removeConnectedBackground = (png, bounds, mode) => {
  const { x, y, width, height } = bounds;
  const visited = new Uint8Array(width * height);
  const queue = [];

  const isCandidate = (px, py) => {
    const i = pixelIndex(png, px, py);
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    const a = png.data[i + 3];
    if (a === 0) return false;
    return mode === 'checker'
      ? isCheckerBackground(r, g, b) || isWhiteBackground(r, g, b)
      : mode === 'green'
        ? isGreenScreenBackground(r, g, b)
        : isWhiteBackground(r, g, b);
  };

  const push = (px, py) => {
    if (px < x || py < y || px >= x + width || py >= y + height) return;
    const localX = px - x;
    const localY = py - y;
    const id = localY * width + localX;
    if (visited[id] || !isCandidate(px, py)) return;
    visited[id] = 1;
    queue.push([px, py]);
  };

  for (let px = x; px < x + width; px += 1) {
    push(px, y);
    push(px, y + height - 1);
  }
  for (let py = y; py < y + height; py += 1) {
    push(x, py);
    push(x + width - 1, py);
  }

  for (let head = 0; head < queue.length; head += 1) {
    const [px, py] = queue[head];
    push(px + 1, py);
    push(px - 1, py);
    push(px, py + 1);
    push(px, py - 1);
  }

  for (let localY = 0; localY < height; localY += 1) {
    for (let localX = 0; localX < width; localX += 1) {
      const id = localY * width + localX;
      if (!visited[id]) continue;
      const i = pixelIndex(png, x + localX, y + localY);
      png.data[i] = 0;
      png.data[i + 1] = 0;
      png.data[i + 2] = 0;
      png.data[i + 3] = 0;
    }
  }
};

const createTransparentPng = (width, height) => {
  const png = new PNG({ width, height });
  png.data.fill(0);
  return png;
};

const findVisibleComponents = (png, bounds, predicate = (i) => png.data[i + 3] !== 0) => {
  const { x, y, width, height } = bounds;
  const visited = new Uint8Array(width * height);
  const components = [];

  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      const id = (py - y) * width + (px - x);
      const i = pixelIndex(png, px, py);
      if (visited[id] || !predicate(i, px, py)) continue;

      const component = {
        count: 0,
        minX: px,
        minY: py,
        maxX: px,
        maxY: py,
        pixels: [],
      };
      const queue = [[px, py]];
      visited[id] = 1;

      for (let head = 0; head < queue.length; head += 1) {
        const [cx, cy] = queue[head];
        component.count += 1;
        component.minX = Math.min(component.minX, cx);
        component.minY = Math.min(component.minY, cy);
        component.maxX = Math.max(component.maxX, cx);
        component.maxY = Math.max(component.maxY, cy);
        component.pixels.push([cx, cy]);

        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
          if (nx < x || ny < y || nx >= x + width || ny >= y + height) continue;
          const nextId = (ny - y) * width + (nx - x);
          const nextIndex = pixelIndex(png, nx, ny);
          if (visited[nextId] || !predicate(nextIndex, nx, ny)) continue;
          visited[nextId] = 1;
          queue.push([nx, ny]);
        }
      }

      components.push(component);
    }
  }

  return components;
};

const boundsFromComponents = (components) => {
  if (components.length === 0) return null;

  const result = {
    minX: Math.min(...components.map((component) => component.minX)),
    minY: Math.min(...components.map((component) => component.minY)),
    maxX: Math.max(...components.map((component) => component.maxX)),
    maxY: Math.max(...components.map((component) => component.maxY)),
  };

  return result;
};

const findVisibleBounds = (png, bounds) => boundsFromComponents(
  findVisibleComponents(png, bounds)
    .filter((component) => component.count >= MIN_BOUNDING_COMPONENT_PIXELS),
);

const findLargestVisibleBounds = (png, bounds) => {
  const components = findVisibleComponents(png, bounds)
    .filter((component) => component.count >= MIN_BOUNDING_COMPONENT_PIXELS)
    .sort((a, b) => b.count - a.count);
  return components[0] ?? null;
};

const findRecliningBodyBaseline = (png, bodyBounds) => {
  const minX = bodyBounds.minX + 150;
  const maxX = bodyBounds.maxX - 20;
  if (maxX <= minX) return bodyBounds.maxY;

  const rows = [];
  for (let y = bodyBounds.minY; y <= bodyBounds.maxY; y += 1) {
    let count = 0;
    for (let x = minX; x <= maxX; x += 1) {
      const i = pixelIndex(png, x, y);
      if (png.data[i + 3] !== 0) count += 1;
    }
    rows.push({ y, count });
  }

  const maxCount = Math.max(...rows.map((row) => row.count));
  const baseline = rows
    .filter((row) => row.count >= maxCount * 0.45)
    .at(-1);
  return baseline?.y ?? bodyBounds.maxY;
};

const copyVisibleFrame = (source, target, sourceBounds, targetFrameX, targetFrameY) => {
  for (let y = sourceBounds.minY; y <= sourceBounds.maxY; y += 1) {
    for (let x = sourceBounds.minX; x <= sourceBounds.maxX; x += 1) {
      const si = pixelIndex(source, x, y);
      if (source.data[si + 3] === 0) continue;

      const dx = targetFrameX + (x - sourceBounds.minX);
      const dy = targetFrameY + (y - sourceBounds.minY);
      if (dx < 0 || dy < 0 || dx >= target.width || dy >= target.height) continue;

      const ti = pixelIndex(target, dx, dy);
      target.data[ti] = source.data[si];
      target.data[ti + 1] = source.data[si + 1];
      target.data[ti + 2] = source.data[si + 2];
      target.data[ti + 3] = source.data[si + 3];
    }
  }
};

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const resizeVisibleFrame = async (source, sourceBounds, targetWidth, targetHeight) => {
  const cropWidth = sourceBounds.maxX - sourceBounds.minX + 1;
  const cropHeight = sourceBounds.maxY - sourceBounds.minY + 1;
  const frame = createTransparentPng(cropWidth, cropHeight);
  copyVisibleFrame(source, frame, sourceBounds, 0, 0);

  const { data, info } = await sharp(PNG.sync.write(frame))
    .resize(targetWidth, targetHeight, {
      fit: 'fill',
      kernel: 'lanczos3',
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const resized = new PNG({ width: info.width, height: info.height });
  Buffer.from(data).copy(resized.data);
  return resized;
};

const copyFrameImage = (source, target, targetX, targetY) => {
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const si = pixelIndex(source, x, y);
      if (source.data[si + 3] === 0) continue;

      const dx = targetX + x;
      const dy = targetY + y;
      if (dx < 0 || dy < 0 || dx >= target.width || dy >= target.height) continue;

      const ti = pixelIndex(target, dx, dy);
      target.data[ti] = source.data[si];
      target.data[ti + 1] = source.data[si + 1];
      target.data[ti + 2] = source.data[si + 2];
      target.data[ti + 3] = source.data[si + 3];
    }
  }
};

const normalizeGridFrames = async (png, options = {}) => {
  const normalized = createTransparentPng(png.width, png.height);
  const frameBounds = [];

  for (let frame = 0; frame < GRID_FRAMES; frame += 1) {
    const col = frame % GRID_COLUMNS;
    const row = Math.floor(frame / GRID_COLUMNS);
    const frameX = col * FRAME_WIDTH;
    const frameY = row * FRAME_HEIGHT;
    const bounds = findVisibleBounds(png, {
      x: frameX,
      y: frameY,
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
    });
    const bodyBounds = options.recline
      ? findLargestVisibleBounds(png, {
        x: frameX,
        y: frameY,
        width: FRAME_WIDTH,
        height: FRAME_HEIGHT,
      })
      : bounds;
    const bodyBaseline = bodyBounds && options.recline
      ? findRecliningBodyBaseline(png, bodyBounds)
      : null;

    frameBounds.push({ frame, col, row, frameX, frameY, bounds, bodyBounds, bodyBaseline });
  }

  const visibleFrames = frameBounds.filter((item) => item.bounds);
  const sizingBounds = visibleFrames.map((item) => item.bodyBounds ?? item.bounds);
  const targetContentHeight = median(
    sizingBounds.map((bounds) => bounds.maxY - bounds.minY + 1),
  );
  const targetContentWidth = median(
    sizingBounds.map((bounds) => bounds.maxX - bounds.minX + 1),
  );

  for (const item of visibleFrames) {
    const { frameX, frameY, bounds, bodyBounds, bodyBaseline } = item;
    if (!bounds) continue;

    const contentWidth = bounds.maxX - bounds.minX + 1;
    const contentHeight = bounds.maxY - bounds.minY + 1;
    const bodyWidth = bodyBounds ? bodyBounds.maxX - bodyBounds.minX + 1 : contentWidth;
    const fittedWidth = Math.min(targetContentWidth, FRAME_WIDTH - 8);
    const fittedHeight = Math.min(targetContentHeight, FRAME_HEIGHT - 8);
    const reclineScale = fittedWidth / bodyWidth;
    const targetWidth = Math.max(1, Math.round(options.recline ? contentWidth * reclineScale : fittedWidth));
    const targetHeight = Math.max(1, Math.round(options.recline ? contentHeight * reclineScale : fittedHeight));
    const resized = await resizeVisibleFrame(png, bounds, targetWidth, targetHeight);
    const targetX = frameX + Math.round((FRAME_WIDTH - targetWidth) / 2);
    const baselineOffset = bodyBaseline === null
      ? targetHeight
      : Math.round((bodyBaseline - bounds.minY) * reclineScale);
    const baselineY = options.recline ? SLEEP_BODY_BASELINE_Y : FRAME_BASELINE_Y;
    const targetY = frameY + Math.min(
      FRAME_HEIGHT - targetHeight,
      baselineY - baselineOffset,
    );

    copyFrameImage(resized, normalized, targetX, targetY);
  }

  return normalized;
};

const processGridSheet = async (sourcePath, outputPath, options = {}) => {
  const png = await readImage(sourcePath);
  if (png.width !== FRAME_WIDTH * GRID_COLUMNS || png.height !== FRAME_HEIGHT * GRID_ROWS) {
    throw new Error(`${sourcePath} must be ${FRAME_WIDTH * GRID_COLUMNS}x${FRAME_HEIGHT * GRID_ROWS}`);
  }

  let usedGreenScreen = false;
  for (let frame = 0; frame < GRID_FRAMES; frame += 1) {
    const col = frame % GRID_COLUMNS;
    const row = Math.floor(frame / GRID_COLUMNS);
    const frameBounds = {
      x: col * FRAME_WIDTH,
      y: row * FRAME_HEIGHT,
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
    };
    const mode = resolveBackgroundMode(png, frameBounds, 'white');
    usedGreenScreen ||= mode === 'green';
    if (mode === 'green') {
      removeGreenScreenBackground(png, frameBounds);
    } else {
      removeConnectedBackground(png, frameBounds, mode);
    }
  }

  const normalized = await normalizeGridFrames(png, options);
  if (usedGreenScreen) {
    removeGreenScreenBackground(normalized, {
      x: 0,
      y: 0,
      width: normalized.width,
      height: normalized.height,
    });
  }
  writePng(outputPath, normalized);
};

const processObject = async (sourcePath, outputPath, mode = 'white') => {
  const png = await readImage(sourcePath);
  const bounds = {
    x: 0,
    y: 0,
    width: png.width,
    height: png.height,
  };
  removeBackground(png, bounds, mode);
  writePng(outputPath, png);
};

const processButton = async (sourcePath, outputPath) => {
  const png = await readImage(sourcePath);
  if (png.width !== FRAME_WIDTH * 2 || png.height !== FRAME_HEIGHT) {
    throw new Error(`${sourcePath} must be ${FRAME_WIDTH * 2}x${FRAME_HEIGHT}`);
  }

  for (let frame = 0; frame < 2; frame += 1) {
    const frameBounds = {
      x: frame * FRAME_WIDTH,
      y: 0,
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
    };
    removeBackground(png, frameBounds, 'checker');
  }

  writePng(outputPath, png);
};

const listJpegs = (dir) => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => /\.(jpe?g)$/i.test(name))
    .sort()
    .map((name) => path.join(dir, name));
};

const writeManifest = ({ ambientKeys, feedKeys, touchKeys }) => {
  const manifest = `export const MODERN_GAME_WIDTH = ${GAME_WIDTH};
export const MODERN_GAME_HEIGHT = ${GAME_HEIGHT};
export const MODERN_FRAME_WIDTH = ${FRAME_WIDTH};
export const MODERN_FRAME_HEIGHT = ${FRAME_HEIGHT};
export const MODERN_GRID_FRAMES = ${GRID_FRAMES};

export const modernBackgrounds = {
  sunny: '/assets/backgrounds/sunny.jpeg',
} as const;

export const modernAmbientAnimations = ${JSON.stringify(ambientKeys, null, 2)} as const;

export const modernFeedAssets = {
  run: ${JSON.stringify(feedKeys.run ?? null)},
  eat: ${JSON.stringify(feedKeys.eat ?? null)},
  food: ${JSON.stringify(feedKeys.food ?? null)},
} as const;

export const modernTouchAssets = {
  touch: ${JSON.stringify(touchKeys.touch ?? null)},
} as const;

export const modernUiAssets = {
  feedButton: 'feed_button',
} as const;
`;

  ensureDir(path.dirname(GENERATED_MANIFEST));
  fs.writeFileSync(GENERATED_MANIFEST, manifest);
};

ensureDir(OUTPUT_DIR);
for (const ownedDir of ['actions', 'ambient', 'backgrounds', 'ui']) {
  fs.rmSync(path.join(OUTPUT_DIR, ownedDir), { recursive: true, force: true });
}

const backgroundSource = path.join(SOURCE_DIR, 'backgrounds/sunny.jpeg');
ensureDir(path.join(OUTPUT_DIR, 'backgrounds'));
await sharp(backgroundSource)
  .resize(GAME_WIDTH, GAME_HEIGHT, { fit: 'cover' })
  .jpeg({ quality: 92 })
  .toFile(path.join(OUTPUT_DIR, 'backgrounds/sunny.jpeg'));

const ambientKeys = [];
for (const filePath of listJpegs(path.join(SOURCE_DIR, 'ambient'))) {
  const key = toKey(filePath);
  ambientKeys.push(key);
  await processGridSheet(filePath, path.join(OUTPUT_DIR, `ambient/${key}.png`), {
    key,
    recline: key === 'sleep',
  });
}

const feedKeys = {};
for (const filePath of listJpegs(path.join(SOURCE_DIR, 'actions/feed'))) {
  const key = toKey(filePath);
  feedKeys[key] = key;
  if (key === 'food') {
    await processObject(filePath, path.join(OUTPUT_DIR, 'actions/feed/food.png'), 'white');
  } else {
    await processGridSheet(filePath, path.join(OUTPUT_DIR, `actions/feed/${key}.png`), { key });
  }
}

const touchKeys = {};
for (const filePath of listJpegs(path.join(SOURCE_DIR, 'actions/touch'))) {
  const key = toKey(filePath);
  touchKeys[key] = key;
  await processGridSheet(filePath, path.join(OUTPUT_DIR, `actions/touch/${key}.png`), { key });
}

await processButton(
  path.join(SOURCE_DIR, 'ui/feed_button.jpeg'),
  path.join(OUTPUT_DIR, 'ui/feed_button.png'),
);

writeManifest({ ambientKeys, feedKeys, touchKeys });

console.log(`Processed modern assets to ${path.relative(ROOT, OUTPUT_DIR)}`);
console.log(`Generated ${path.relative(ROOT, GENERATED_MANIFEST)}`);
