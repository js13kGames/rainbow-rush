import assert from "node:assert/strict";
import {
  classifyRoute,
  movingCirclesHit,
  pointInPolygon,
  routeLength,
  squaredDistanceToSegment,
  TUTORIAL_BASIC_RUSH_ROUTE,
  TUTORIAL_MULTI_RUSH_ROUTE,
  TUTORIAL_MULTI_TARGET_PROGRESS,
  TUTORIAL_RUSH_ROUTES,
} from "../src/geometry.ts";
import { BOOMERANG, LOOP, NORMAL, weaknessMatches, ZIGZAG } from "../src/model.ts";

assert.deepEqual(
  classifyRoute([
    { x: 0, y: 0 },
    { x: 50, y: 2 },
    { x: 120, y: 0 },
  ]),
  [NORMAL],
);
assert.deepEqual(classifyRoute(TUTORIAL_BASIC_RUSH_ROUTE), [NORMAL]);
assert.deepEqual(
  classifyRoute([
    { x: 0, y: 0 },
    { x: 40, y: 0 },
  ]),
  [NORMAL],
);

const boomerang = TUTORIAL_RUSH_ROUTES[BOOMERANG];
assert.deepEqual(classifyRoute(boomerang), [BOOMERANG]);
assert.deepEqual(classifyRoute(boomerang.map(({ x, y }) => ({ x: x * (650 / 150), y: y * (650 / 150) }))), [BOOMERANG]);
assert.equal(routeLength(boomerang.slice(3)), 100);
assert.equal(routeLength(boomerang.slice(0, 4)), 150);
for (let length = 2; length <= boomerang.length; length += 1) {
  assert.equal(classifyRoute(boomerang.slice(0, length)).includes(ZIGZAG), false);
}
const diagonalBoomerang = boomerang.map(({ x, y }) => ({
  x: (x - y) / Math.SQRT2,
  y: (x + y) / Math.SQRT2,
}));
assert.deepEqual(classifyRoute(diagonalBoomerang), [BOOMERANG]);
const embeddedBoomerang = [{ x: -80, y: -70 }, { x: -40, y: -35 }, ...boomerang, { x: 55, y: 60 }, { x: 100, y: 90 }];
assert.deepEqual(classifyRoute(embeddedBoomerang).includes(BOOMERANG), true);

const loop = TUTORIAL_RUSH_ROUTES[LOOP];
assert.deepEqual(classifyRoute(loop), [LOOP]);
assert.deepEqual(classifyRoute(loop.map(({ x, y }) => ({ x: x * 2.75, y: y * 2.75 }))), [LOOP]);
assert.equal(loop.length, 21);
assert.ok(Math.abs(loop[loop.length - 1].x - 100) < 0.001);
assert.ok(Math.abs(loop[loop.length - 1].y - 160) < 0.001);
assert.equal(pointInPolygon({ x: 100, y: 100 }, loop), true);
for (let position = 0.1; position < loop.length - 1; position += 0.1) {
  const index = Math.floor(position);
  const blend = position - index;
  const end = {
    x: loop[index].x + (loop[index + 1].x - loop[index].x) * blend,
    y: loop[index].y + (loop[index + 1].y - loop[index].y) * blend,
  };
  const prefix = [...loop.slice(0, index + 1), end].map(({ x, y }) => ({ x: x * 2.75, y: y * 2.75 }));
  assert.equal(classifyRoute(prefix).includes(ZIGZAG), false);
}

const combinedZigzagStart = boomerang.length + loop.length;
for (let position = 0.1; position < combinedZigzagStart - 1; position += 0.1) {
  const index = Math.floor(position);
  const blend = position - index;
  const end = {
    x:
      TUTORIAL_MULTI_RUSH_ROUTE[index].x +
      (TUTORIAL_MULTI_RUSH_ROUTE[index + 1].x - TUTORIAL_MULTI_RUSH_ROUTE[index].x) * blend,
    y:
      TUTORIAL_MULTI_RUSH_ROUTE[index].y +
      (TUTORIAL_MULTI_RUSH_ROUTE[index + 1].y - TUTORIAL_MULTI_RUSH_ROUTE[index].y) * blend,
  };
  const prefix = [...TUTORIAL_MULTI_RUSH_ROUTE.slice(0, index + 1), end].map(({ x, y }) => ({
    x: x * 2.2,
    y: y * 2.2,
  }));
  assert.equal(classifyRoute(prefix).includes(ZIGZAG), false);
}
assert.equal(TUTORIAL_MULTI_TARGET_PROGRESS.length, 4);
assert.equal(
  TUTORIAL_MULTI_TARGET_PROGRESS.every((progress) => progress > 0 && progress < 1),
  true,
);

assert.deepEqual(classifyRoute(TUTORIAL_RUSH_ROUTES[ZIGZAG]), [ZIGZAG]);
assert.deepEqual(classifyRoute(TUTORIAL_MULTI_RUSH_ROUTE), [BOOMERANG, LOOP, ZIGZAG]);

const loopAndZigzag = [...loop, { x: 185, y: 25 }, { x: 240, y: 175 }, { x: 295, y: 25 }, { x: 350, y: 100 }];
assert.deepEqual(classifyRoute(loopAndZigzag), [LOOP, ZIGZAG]);

const loopAtBoomerangEnd = loop.map((point) => ({
  x: point.x - 150,
  y: point.y - 93,
}));
const boomerangLoopAndZigzag = [
  ...boomerang,
  ...loopAtBoomerangEnd,
  { x: 35, y: -68 },
  { x: 90, y: 82 },
  { x: 145, y: -68 },
  { x: 200, y: 7 },
];
assert.deepEqual(classifyRoute(boomerangLoopAndZigzag), [BOOMERANG, LOOP, ZIGZAG]);

assert.deepEqual(
  classifyRoute([
    { x: 0, y: 100 },
    { x: 45, y: 25 },
    { x: 90, y: 175 },
    { x: 145, y: 25 },
    { x: 200, y: 100 },
  ]),
  [ZIGZAG],
);

assert.equal(squaredDistanceToSegment({ x: 5, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 16);
assert.equal(movingCirclesHit({ x: -10, y: 0 }, { x: 10, y: 0 }, 1, { x: 10, y: 0 }, { x: -10, y: 0 }, 1), true);
assert.equal(movingCirclesHit({ x: -10, y: 0 }, { x: 10, y: 0 }, 1, { x: -10, y: 8 }, { x: 10, y: 8 }, 1), false);
assert.deepEqual([NORMAL, BOOMERANG, LOOP, ZIGZAG], [0, 1, 2, 3]);
assert.equal(weaknessMatches(NORMAL, [BOOMERANG]), true);
assert.equal(weaknessMatches(NORMAL, [LOOP, ZIGZAG]), true);
assert.equal(weaknessMatches(LOOP, [LOOP, ZIGZAG]), true);
assert.equal(weaknessMatches(ZIGZAG, [LOOP, ZIGZAG]), true);
assert.equal(weaknessMatches(BOOMERANG, [LOOP, ZIGZAG]), false);
assert.equal(weaknessMatches(NORMAL, [NORMAL]), true);
assert.equal(weaknessMatches(BOOMERANG, [NORMAL]), false);
console.log("Geometry tests passed");
