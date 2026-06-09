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

const trimTransparentBounds = (source) => {
  const bounds = findVisibleBounds(source, {
    x: 0,
    y: 0,
    width: source.width,
    height: source.height,
  });
  if (!bounds) return source;

  const trimmed = createTransparentPng(
    bounds.maxX - bounds.minX + 1,
    bounds.maxY - bounds.minY + 1,
  );
  copyVisibleFrame(source, trimmed, bounds, 0, 0);
  return trimmed;
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
    const targetWidth = Math.max(1, Math.round(
      options.preserveSourceScale
        ? contentWidth
        : options.recline
          ? contentWidth * reclineScale
          : fittedWidth,
    ));
    const targetHeight = Math.max(1, Math.round(
      options.preserveSourceScale
        ? contentHeight
        : options.recline
          ? contentHeight * reclineScale
          : fittedHeight,
    ));
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

const processObject = async (sourcePath, outputPath, mode = 'white', options = {}) => {
  const png = await readImage(sourcePath);
  const bounds = {
    x: 0,
    y: 0,
    width: png.width,
    height: png.height,
  };
  removeBackground(png, bounds, mode);
  writePng(outputPath, options.trim ? trimTransparentBounds(png) : png);
};

const processButton = async (sourcePath, outputPath) => {
  const png = await readImage(sourcePath);
  const isTwoFrameButton = png.width === FRAME_WIDTH * 2 && png.height === FRAME_HEIGHT;
  const isGridSheet = png.width === FRAME_WIDTH * GRID_COLUMNS && png.height === FRAME_HEIGHT * GRID_ROWS;
  if (!isTwoFrameButton && !isGridSheet) {
    throw new Error(
      `${sourcePath} must be ${FRAME_WIDTH * 2}x${FRAME_HEIGHT} or ${FRAME_WIDTH * GRID_COLUMNS}x${FRAME_HEIGHT * GRID_ROWS}`,
    );
  }

  const button = createTransparentPng(FRAME_WIDTH * 2, FRAME_HEIGHT);

  for (let frame = 0; frame < 2; frame += 1) {
    const frameBounds = {
      x: frame * FRAME_WIDTH,
      y: 0,
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
    };
    removeBackground(png, frameBounds, 'checker');
    copyFrameImage(
      await resizeVisibleFrame(png, {
        minX: frameBounds.x,
        minY: frameBounds.y,
        maxX: frameBounds.x + FRAME_WIDTH - 1,
        maxY: frameBounds.y + FRAME_HEIGHT - 1,
      }, FRAME_WIDTH, FRAME_HEIGHT),
      button,
      frame * FRAME_WIDTH,
      0,
    );
  }

  writePng(outputPath, button);
};

const listJpegs = (dir) => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => /\.(jpe?g)$/i.test(name))
    .sort()
    .map((name) => path.join(dir, name));
};

const listAmbientJpegs = (dir) => {
  if (!fs.existsSync(dir)) return [];

  const rootFiles = listJpegs(dir).map((filePath) => ({
    filePath,
    group: 'default',
    key: toKey(filePath),
  }));

  const groupedFiles = fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => listJpegs(path.join(dir, entry.name)).map((filePath) => ({
      filePath,
      group: entry.name,
      key: toKey(filePath),
    })));

  return [...rootFiles, ...groupedFiles];
};

const listGroupedJpegs = (dir) => {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => listJpegs(path.join(dir, entry.name)).map((filePath) => ({
      filePath,
      group: entry.name,
      key: toKey(filePath),
    })));
};

const listFeatureFiles = (dir) => {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => fs.readdirSync(path.join(dir, entry.name), { withFileTypes: true })
      .filter((fileEntry) => fileEntry.isFile())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((fileEntry) => ({
        feature: entry.name,
        filePath: path.join(dir, entry.name, fileEntry.name),
        key: toKey(fileEntry.name),
      })));
};

const processActor = async (actorName) => {
  const actorSourceDir = path.join(SOURCE_DIR, 'actors', actorName);
  const actorOutputDir = path.join(OUTPUT_DIR, 'actors', actorName);

  const ambientKeys = [];
  const ambientGroups = {};
  for (const { filePath, group, key } of listAmbientJpegs(path.join(actorSourceDir, 'ambient'))) {
    ambientKeys.push(key);
    ambientGroups[group] ??= [];
    ambientGroups[group].push(key);
    await processGridSheet(filePath, path.join(actorOutputDir, `ambient/${key}.png`), {
      key,
      preserveSourceScale: group === 'motion',
      recline: key === 'sleep',
    });
  }

  const emotionKeys = [];
  for (const filePath of listJpegs(path.join(actorSourceDir, 'emotions'))) {
    const key = toKey(filePath);
    emotionKeys.push(key);
    await processGridSheet(filePath, path.join(actorOutputDir, `emotions/${key}.png`), { key });
  }

  const actionGroups = {};
  for (const { filePath, group, key } of listGroupedJpegs(path.join(actorSourceDir, 'actions'))) {
    actionGroups[group] ??= {};
    actionGroups[group][key] = key;
    if (actorName === 'snoopy' && group === 'feed' && key === 'food') {
      await processObject(filePath, path.join(actorOutputDir, `actions/${group}/${key}.png`), 'white');
    } else {
      await processGridSheet(filePath, path.join(actorOutputDir, `actions/${group}/${key}.png`), { key });
    }
  }

  return {
    actionGroups,
    ambientAnimationGroups: ambientGroups,
    ambientAnimations: ambientKeys,
    emotionAnimations: emotionKeys,
  };
};

const isImageFile = (filePath) => /\.(jpe?g|png|webp)$/i.test(filePath);

const getFeatureOutput = (feature, key, filePath, outputExtension = path.extname(filePath)) => {
  const relativeOutput = path.join('features', feature, `${key}${outputExtension}`).replaceAll(path.sep, '/');
  return {
    outputPath: path.join(OUTPUT_DIR, relativeOutput),
    publicPath: `/assets/${relativeOutput}`,
  };
};

const processFeatureAssets = async () => {
  const features = {};

  for (const { feature, filePath, key } of listFeatureFiles(path.join(SOURCE_DIR, 'features'))) {
    let publicPath;

    if (feature === 'letter' && key === 'motion' && isImageFile(filePath)) {
      const output = getFeatureOutput(feature, key, filePath, '.png');
      await processGridSheet(filePath, output.outputPath, { key, preserveSourceScale: true });
      publicPath = output.publicPath;
    } else if (feature === 'letter' && ['letter', 'content'].includes(key) && isImageFile(filePath)) {
      const output = getFeatureOutput(feature, key, filePath, '.png');
      await processObject(filePath, output.outputPath, 'green', { trim: true });
      publicPath = output.publicPath;
    } else {
      const output = getFeatureOutput(feature, key, filePath);
      ensureDir(path.dirname(output.outputPath));
      fs.copyFileSync(filePath, output.outputPath);
      publicPath = output.publicPath;
    }

    features[feature] ??= { assets: {} };
    features[feature].assets[key] = publicPath;
  }

  return features;
};

const writeManifest = ({ actors, features }) => {
  const snoopy = actors.snoopy ?? {
    actionGroups: {},
    ambientAnimationGroups: {},
    ambientAnimations: [],
    emotionAnimations: [],
  };
  const manifest = `export const MODERN_GAME_WIDTH = ${GAME_WIDTH};
export const MODERN_GAME_HEIGHT = ${GAME_HEIGHT};
export const MODERN_FRAME_WIDTH = ${FRAME_WIDTH};
export const MODERN_FRAME_HEIGHT = ${FRAME_HEIGHT};
export const MODERN_GRID_FRAMES = ${GRID_FRAMES};

export const modernBackgrounds = {
  sunny: '/assets/backgrounds/sunny.jpeg',
} as const;

export const modernActors = ${JSON.stringify(actors, null, 2)} as const;

export const modernFeatures = ${JSON.stringify(features, null, 2)} as const;

export const modernSnoopy = modernActors.snoopy;

export const modernAmbientAnimations = modernSnoopy.ambientAnimations;

export const modernAmbientAnimationGroups = modernSnoopy.ambientAnimationGroups;

export const modernEmotionAnimations = modernSnoopy.emotionAnimations;

export const modernActionGroups = modernSnoopy.actionGroups;

export const modernFeedAssets = {
  run: ${JSON.stringify(snoopy.actionGroups.feed?.run ?? null)},
  eat: ${JSON.stringify(snoopy.actionGroups.feed?.eat ?? null)},
  food: ${JSON.stringify(snoopy.actionGroups.feed?.food ?? null)},
} as const;

export const modernTouchAssets = {
  touch: ${JSON.stringify(snoopy.actionGroups.touch?.touch ?? null)},
} as const;

export const modernUiAssets = {
  feedButton: 'feed_button',
} as const;
`;

  ensureDir(path.dirname(GENERATED_MANIFEST));
  fs.writeFileSync(GENERATED_MANIFEST, manifest);
};

ensureDir(OUTPUT_DIR);
for (const ownedDir of ['actions', 'actors', 'ambient', 'backgrounds', 'emotions', 'features', 'ui']) {
  fs.rmSync(path.join(OUTPUT_DIR, ownedDir), { recursive: true, force: true });
}

const backgroundSource = path.join(SOURCE_DIR, 'backgrounds/sunny.jpeg');
ensureDir(path.join(OUTPUT_DIR, 'backgrounds'));
fs.copyFileSync(backgroundSource, path.join(OUTPUT_DIR, 'backgrounds/sunny.jpeg'));

const actors = {};
const actorsDir = path.join(SOURCE_DIR, 'actors');
if (fs.existsSync(actorsDir)) {
  for (const entry of fs.readdirSync(actorsDir, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))) {
    actors[entry.name] = await processActor(entry.name);
  }
}

const features = await processFeatureAssets();

await processButton(
  path.join(SOURCE_DIR, 'ui/feed_button.jpeg'),
  path.join(OUTPUT_DIR, 'ui/feed_button.png'),
);

writeManifest({ actors, features });

console.log(`Processed modern assets to ${path.relative(ROOT, OUTPUT_DIR)}`);
console.log(`Generated ${path.relative(ROOT, GENERATED_MANIFEST)}`);
