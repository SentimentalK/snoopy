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

const isCheckerBackground = (r, g, b) => {
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  return max - min <= 36 && min >= 80 && max <= 245;
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
      png.data[i + 3] = 0;
    }
  }
};

const processGridSheet = async (sourcePath, outputPath) => {
  const png = await readImage(sourcePath);
  if (png.width !== FRAME_WIDTH * GRID_COLUMNS || png.height !== FRAME_HEIGHT * GRID_ROWS) {
    throw new Error(`${sourcePath} must be ${FRAME_WIDTH * GRID_COLUMNS}x${FRAME_HEIGHT * GRID_ROWS}`);
  }

  for (let frame = 0; frame < GRID_FRAMES; frame += 1) {
    const col = frame % GRID_COLUMNS;
    const row = Math.floor(frame / GRID_COLUMNS);
    removeConnectedBackground(png, {
      x: col * FRAME_WIDTH,
      y: row * FRAME_HEIGHT,
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
    }, 'white');
  }

  writePng(outputPath, png);
};

const processObject = async (sourcePath, outputPath, mode = 'white') => {
  const png = await readImage(sourcePath);
  removeConnectedBackground(png, {
    x: 0,
    y: 0,
    width: png.width,
    height: png.height,
  }, mode);
  writePng(outputPath, png);
};

const processButton = async (sourcePath, outputPath) => {
  const png = await readImage(sourcePath);
  if (png.width !== FRAME_WIDTH * 2 || png.height !== FRAME_HEIGHT) {
    throw new Error(`${sourcePath} must be ${FRAME_WIDTH * 2}x${FRAME_HEIGHT}`);
  }

  for (let frame = 0; frame < 2; frame += 1) {
    removeConnectedBackground(png, {
      x: frame * FRAME_WIDTH,
      y: 0,
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
    }, 'checker');
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
  await processGridSheet(filePath, path.join(OUTPUT_DIR, `ambient/${key}.png`));
}

const feedKeys = {};
for (const filePath of listJpegs(path.join(SOURCE_DIR, 'actions/feed'))) {
  const key = toKey(filePath);
  feedKeys[key] = key;
  if (key === 'food') {
    await processObject(filePath, path.join(OUTPUT_DIR, 'actions/feed/food.png'), 'white');
  } else {
    await processGridSheet(filePath, path.join(OUTPUT_DIR, `actions/feed/${key}.png`));
  }
}

const touchKeys = {};
for (const filePath of listJpegs(path.join(SOURCE_DIR, 'actions/touch'))) {
  const key = toKey(filePath);
  touchKeys[key] = key;
  await processGridSheet(filePath, path.join(OUTPUT_DIR, `actions/touch/${key}.png`));
}

await processButton(
  path.join(SOURCE_DIR, 'ui/feed_button.jpeg'),
  path.join(OUTPUT_DIR, 'ui/feed_button.png'),
);

writeManifest({ ambientKeys, feedKeys, touchKeys });

console.log(`Processed modern assets to ${path.relative(ROOT, OUTPUT_DIR)}`);
console.log(`Generated ${path.relative(ROOT, GENERATED_MANIFEST)}`);
