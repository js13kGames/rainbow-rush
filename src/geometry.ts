import type { Gestures, Point } from "./model.ts";
import { BOOMERANG, LOOP, NORMAL, ZIGZAG } from "./model.ts";

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function routeLength(points: Point[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += distance(points[index - 1], points[index]);
  }
  return length;
}

const tutorialBoomerang: Point[] = [
  { x: 0, y: 0 },
  { x: 50, y: 0 },
  { x: 100, y: 0 },
  { x: 150, y: 0 },
  { x: 100, y: 0 },
  { x: 50, y: 0 },
];
const tutorialLoop: Point[] = Array.from({ length: 21 }, (_, index) => {
  const angle = (index / 16) * Math.PI * 2;
  return { x: 100 + Math.cos(angle) * 60, y: 100 + Math.sin(angle) * 60 };
});
const tutorialZigzag: Point[] = [
  { x: 0, y: 100 },
  { x: 45, y: 25 },
  { x: 90, y: 175 },
  { x: 145, y: 25 },
  { x: 200, y: 100 },
];

export const TUTORIAL_BASIC_RUSH_ROUTE: Point[] = [
  { x: 0, y: 0 },
  { x: 180, y: 0 },
];
export const TUTORIAL_RUSH_ROUTES: Point[][] = [[], tutorialBoomerang, tutorialLoop, tutorialZigzag];
export const TUTORIAL_MULTI_RUSH_ROUTE: Point[] = [
  ...tutorialBoomerang,
  ...tutorialLoop.map((point) => ({ x: point.x - 160, y: point.y - 100 })),
  { x: -65, y: -70 },
  { x: -10, y: 80 },
  { x: 45, y: -70 },
  { x: 100, y: 5 },
];
const tutorialMultiEndIndex = TUTORIAL_MULTI_RUSH_ROUTE.length - 1;
const tutorialMultiLength = routeLength(TUTORIAL_MULTI_RUSH_ROUTE);
const tutorialMultiProgressAt = (index: number) =>
  routeLength(TUTORIAL_MULTI_RUSH_ROUTE.slice(0, index + 1)) / tutorialMultiLength;
export const TUTORIAL_MULTI_TARGET_PROGRESS = [
  tutorialMultiProgressAt(tutorialBoomerang.length + Math.floor(tutorialLoop.length * 0.4)),
  tutorialMultiProgressAt(3),
  tutorialMultiProgressAt(tutorialBoomerang.length + Math.floor(tutorialLoop.length * 0.6)),
  tutorialMultiProgressAt(tutorialMultiEndIndex - 2),
];

export function squaredDistanceToSegment(point: Point, start: Point, end: Point): number {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
  const projection = segmentLengthSquared
    ? Math.max(0, Math.min(1, ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) / segmentLengthSquared))
    : 0;
  const nearestX = start.x + segmentX * projection;
  const nearestY = start.y + segmentY * projection;
  return (point.x - nearestX) ** 2 + (point.y - nearestY) ** 2;
}

export function movingCirclesHit(
  aStart: Point,
  aEnd: Point,
  aRadius: number,
  bStart: Point,
  bEnd: Point,
  bRadius: number,
): boolean {
  const relativeStart = { x: bStart.x - aStart.x, y: bStart.y - aStart.y };
  const relativeEnd = { x: bEnd.x - aEnd.x, y: bEnd.y - aEnd.y };
  const radius = aRadius + bRadius;
  return squaredDistanceToSegment({ x: 0, y: 0 }, relativeStart, relativeEnd) < radius * radius;
}

export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const a = polygon[current];
    const b = polygon[previous];
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function countDirectionChanges(points: Point[]): number {
  const samples: Point[] = [points[0]];
  for (const point of points.slice(1)) {
    if (distance(samples[samples.length - 1], point) >= 22) samples.push(point);
  }
  if (distance(samples[samples.length - 1], points[points.length - 1]) > 8) {
    samples.push(points[points.length - 1]);
  }

  const first = samples[0];
  const last = samples[samples.length - 1];
  const horizontal = Math.abs(last.x - first.x) >= Math.abs(last.y - first.y);
  let previousSign = 0;
  let changes = 0;

  for (let index = 1; index < samples.length; index += 1) {
    const change = horizontal ? samples[index].y - samples[index - 1].y : samples[index].x - samples[index - 1].x;
    if (Math.abs(change) < 10) continue;
    const sign = Math.sign(change);
    if (previousSign && sign !== previousSign) changes += 1;
    previousSign = sign;
  }
  return changes;
}

function countSharpTurns(points: Point[]): number {
  let turns = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const beforeX = points[index].x - points[index - 1].x;
    const beforeY = points[index].y - points[index - 1].y;
    const afterX = points[index + 1].x - points[index].x;
    const afterY = points[index + 1].y - points[index].y;
    const beforeLength = Math.hypot(beforeX, beforeY);
    const afterLength = Math.hypot(afterX, afterY);
    if (beforeLength < 8 || afterLength < 8) continue;
    const cosine = (beforeX * afterX + beforeY * afterY) / (beforeLength * afterLength);
    if (cosine < 0.5) turns += 1;
  }
  return turns;
}

function principalAxisAspectRatio(points: Point[]): number {
  const center = points.reduce(
    (sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }),
    { x: 0, y: 0 },
  );
  let xx = 0;
  let xy = 0;
  let yy = 0;
  for (const point of points) {
    const x = point.x - center.x;
    const y = point.y - center.y;
    xx += x * x;
    xy += x * y;
    yy += y * y;
  }
  const trace = xx + yy;
  const spread = Math.sqrt(Math.max(0, (xx - yy) ** 2 + 4 * xy * xy));
  const majorVariance = (trace + spread) / 2;
  const minorVariance = (trace - spread) / 2;
  return Math.sqrt(majorVariance / Math.max(1, minorVariance));
}

function isBoomerangSegment(points: Point[]): boolean {
  if (points.length < 4) return false;
  const length = routeLength(points);
  const first = points[0];
  const maximumDistance = Math.max(...points.map((point) => distance(first, point)));
  const returnDistance = distance(first, points[points.length - 1]);
  return (
    length > 150 &&
    maximumDistance > 90 &&
    returnDistance < maximumDistance * 0.45 &&
    length > maximumDistance * 1.65 &&
    principalAxisAspectRatio(points) > 2.4
  );
}

function isBoomerang(points: Point[]): boolean {
  for (let startIndex = 0; startIndex < points.length - 3; startIndex += 1) {
    let length = 0;
    for (let endIndex = startIndex + 1; endIndex < points.length; endIndex += 1) {
      length += distance(points[endIndex - 1], points[endIndex]);
      if (length <= 150 || endIndex - startIndex < 3) continue;
      if (isBoomerangSegment(points.slice(startIndex, endIndex + 1))) return true;
    }
  }
  return false;
}

function findLoopRanges(points: Point[]): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (let startIndex = 0; startIndex < points.length - 3; startIndex += 1) {
    let length = 0;
    let bestEndIndex = -1;
    let bestClosureDistance = Infinity;
    let minimumX = points[startIndex].x;
    let maximumX = points[startIndex].x;
    let minimumY = points[startIndex].y;
    let maximumY = points[startIndex].y;

    for (let endIndex = startIndex + 1; endIndex < points.length; endIndex += 1) {
      length += distance(points[endIndex - 1], points[endIndex]);
      minimumX = Math.min(minimumX, points[endIndex].x);
      maximumX = Math.max(maximumX, points[endIndex].x);
      minimumY = Math.min(minimumY, points[endIndex].y);
      maximumY = Math.max(maximumY, points[endIndex].y);
      const closureDistance = distance(points[startIndex], points[endIndex]);
      if (
        length > 170 &&
        closureDistance < 62 &&
        maximumX - minimumX > 65 &&
        maximumY - minimumY > 65 &&
        principalAxisAspectRatio(points.slice(startIndex, endIndex + 1)) < 2.2 &&
        closureDistance < bestClosureDistance
      ) {
        bestEndIndex = endIndex;
        bestClosureDistance = closureDistance;
      }
    }
    if (bestEndIndex >= 0) ranges.push([startIndex, bestEndIndex]);
  }
  return ranges;
}

export function classifyRoute(points: Point[]): Gestures {
  if (points.length < 2) return [NORMAL];

  const length = routeLength(points);
  const first = points[0];
  const last = points[points.length - 1];
  const directness = distance(first, last) / Math.max(1, length);
  const loopRanges = findLoopRanges(points);
  const wholeRouteIsLoop = loopRanges.some(
    ([startIndex, endIndex]) => startIndex === 0 && endIndex === points.length - 1,
  );
  const wholeRouteIsBoomerang = isBoomerangSegment(points);
  const hasBoomerang = isBoomerang(points);
  const hasZigzag =
    !wholeRouteIsLoop &&
    !wholeRouteIsBoomerang &&
    length > 130 &&
    directness < 0.86 &&
    countDirectionChanges(points) > 1 &&
    countSharpTurns(points) > 2;

  const gestures: Gestures = [];
  if (hasBoomerang) gestures.push(BOOMERANG);
  if (loopRanges.length) gestures.push(LOOP);
  if (hasZigzag) gestures.push(ZIGZAG);
  return gestures.length ? gestures : [NORMAL];
}
