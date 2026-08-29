interface ImageSources<PlayerState extends string> {
  enemies: readonly {
    source: string;
    angle?: number;
  }[];
  player: Record<PlayerState, string>;
  projectile: string;
}

interface ImageAssets<PlayerState extends string> {
  enemyImages: HTMLImageElement[];
  enemyBlinkImages: HTMLImageElement[];
  enemyChargeImages: HTMLImageElement[];
  enemyDashChargeImages: HTMLImageElement[];
  enemyLaughImages: HTMLImageElement[];
  playerImages: Record<PlayerState, HTMLImageElement>;
  projectileImages: HTMLImageElement[];
}

export function drawSvg(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement | undefined,
  x: number,
  y: number,
  width: number,
  height = width,
): boolean {
  if (!image?.complete || image.naturalWidth === 0) return false;
  context.drawImage(image, x - width / 2, y - height / 2, width, height);
  return true;
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function random(minimum: number, maximum: number): number {
  return minimum + Math.random() * (maximum - minimum);
}

export function colorAt(colors: readonly string[], index: number): string {
  const color = colors[index];
  if (color === undefined) throw new RangeError(`Color index out of range: ${index}`);
  return color;
}

function loadSvg(source: string): HTMLImageElement {
  const image = new Image();
  image.decoding = "async";
  image.src = `data:image/svg+xml,${encodeURIComponent(source)}`;
  return image;
}

function loadTintedSvg(source: string, color: string): HTMLImageElement {
  return loadSvg(source.split("#0ff").join(color));
}

function eyeRotation(rotation: number, cx: string, cy: string): string {
  return rotation ? ` transform="rotate(${rotation} ${cx} ${cy})"` : "";
}

function makeBlinkSvg(source: string, rotation: number): string {
  return source.replace(/<circle cx="([^"]+)" cy="([^"]+)" r="4" fill="#000"\/>/g, (_, cx, cy) => {
    return `<ellipse cx="${cx}" cy="${cy}" rx="4" ry="1" fill="#000"${eyeRotation(rotation, cx, cy)}/>`;
  });
}

function makeChargeSvg(source: string, rotation: number): string {
  let eyeIndex = 0;
  return source.replace(/<circle cx="([^"]+)" cy="([^"]+)" r="4" fill="#000"\/>/g, (_, cx, cy) => {
    const x = Number(cx);
    const y = Number(cy);
    const direction = eyeIndex++ === 0 ? 1 : -1;
    const outerX = x - direction * 4;
    const pointX = x + direction * 2;
    return `<path d="M${outerX} ${y - 4}L${pointX} ${y}L${outerX} ${y + 4}" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"${eyeRotation(rotation, cx, cy)}/>`;
  });
}

function makeDashChargeSvg(source: string): string {
  return source.replace(
    /<circle cx="([^"]+)" cy="([^"]+)" r="4" fill="#000"\/>/g,
    '<circle cx="$1" cy="$2" r="4.4" fill="#000"/>',
  );
}

function makeLaughSvg(source: string, rotation: number): string {
  return source.replace(/<circle cx="([^"]+)" cy="([^"]+)" r="4" fill="#000"\/>/g, (_, cx, cy) => {
    const x = Number(cx) + 2;
    const y = Number(cy);
    return `<path d="M${x - 4} ${y + 2}L${x} ${y - 2}L${x + 4} ${y + 2}" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"${eyeRotation(rotation, String(x), cy)}/>`;
  });
}

export function createImageAssets<PlayerState extends string>(
  sources: ImageSources<PlayerState>,
  colors: readonly string[],
): ImageAssets<PlayerState> {
  const enemyImages: HTMLImageElement[] = [];
  const enemyBlinkImages: HTMLImageElement[] = [];
  const enemyChargeImages: HTMLImageElement[] = [];
  const enemyDashChargeImages: HTMLImageElement[] = [];
  const enemyLaughImages: HTMLImageElement[] = [];

  sources.enemies.forEach(({ source, angle = 0 }) => {
    enemyImages.push(loadSvg(source));
    enemyBlinkImages.push(loadSvg(makeBlinkSvg(source, angle)));
    enemyChargeImages.push(loadSvg(makeChargeSvg(source, angle)));
    enemyDashChargeImages.push(loadSvg(makeDashChargeSvg(source)));
    enemyLaughImages.push(loadSvg(makeLaughSvg(source, angle)));
  });

  const playerImages = Object.fromEntries(
    Object.entries<string>(sources.player).map(([state, source]) => [state, loadSvg(source)]),
  ) as Record<PlayerState, HTMLImageElement>;

  const projectileImages = colors.map((color) => loadTintedSvg(sources.projectile, color));

  return {
    enemyImages,
    enemyBlinkImages,
    enemyChargeImages,
    enemyDashChargeImages,
    enemyLaughImages,
    playerImages,
    projectileImages,
  };
}

export function loadBestScore(key: string): number {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

export function saveBestScore(key: string, score: number): void {
  try {
    localStorage.setItem(key, String(score));
  } catch {
    // Persistence can be unavailable for local files or privacy-restricted sessions.
  }
}
