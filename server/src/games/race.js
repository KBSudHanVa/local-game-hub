export const LAPS_TO_WIN = 3;
export const RACE_TICK_MS = 50;
export const DEFAULT_MAP_ID = 'grand-oval';

const COLORS = ['#ff6b4a', '#51d6a5', '#55a7ff', '#ffd166', '#c084fc', '#ff77a8', '#75e0df'];
const SAMPLE_COUNT = 128;
const ROAD_WIDTH = 140;
const CHECKPOINT_ANGLES = [0, -Math.PI / 2, Math.PI, Math.PI / 2];

export class GameError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GameError';
  }
}

const MAP_DEFINITIONS = [
  {
    id: 'grand-oval',
    name: 'Grand Oval',
    description: 'A fast, flowing classic with room to build speed.',
    pointAt: (angle) => ({
      x: 500 + 320 * Math.cos(angle),
      y: 310 + 200 * Math.sin(angle),
    }),
  },
  {
    id: 'corner-cut',
    name: 'Corner Cut',
    description: 'A squared-off loop with four tight, technical turns.',
    pointAt: (angle) => ({
      x: 500 + 310 * Math.sign(Math.cos(angle)) * Math.abs(Math.cos(angle)) ** 0.62,
      y: 310 + 190 * Math.sign(Math.sin(angle)) * Math.abs(Math.sin(angle)) ** 0.62,
    }),
  },
  {
    id: 'coffee-run',
    name: 'Coffee Run',
    description: 'A winding route with an extra wiggle through every sector.',
    pointAt: (angle) => {
      const ripple = Math.cos(3 * angle + 0.35);
      return {
        x: 500 + (290 + 26 * ripple) * Math.cos(angle),
        y: 310 + (180 + 22 * ripple) * Math.sin(angle),
      };
    },
  },
  {
    id: 'switchback',
    name: 'Switchback',
    description: 'A broad mountain loop with a pair of sweeping bends.',
    pointAt: (angle) => {
      const ripple = Math.cos(2 * angle + 0.7);
      return {
        x: 500 + (285 + 28 * ripple) * Math.cos(angle),
        y: 310 + (175 + 18 * ripple) * Math.sin(angle),
      };
    },
  },
  {
    id: 'chicane',
    name: 'Chicane',
    description: 'Quick left-right changes keep this compact course lively.',
    pointAt: (angle) => {
      const ripple = Math.sin(5 * angle);
      return {
        x: 500 + (278 + 20 * ripple) * Math.cos(angle),
        y: 310 + (170 + 16 * ripple) * Math.sin(angle),
      };
    },
  },
  {
    id: 'skyline',
    name: 'Skyline Loop',
    description: 'A wide, tilted circuit built for fast, clean laps.',
    pointAt: (angle) => {
      const horizontal = 315 * Math.cos(angle);
      const vertical = 180 * Math.sin(angle);
      const rotation = -0.28;
      return {
        x: 500 + horizontal * Math.cos(rotation) - vertical * Math.sin(rotation),
        y: 310 + horizontal * Math.sin(rotation) + vertical * Math.cos(rotation),
      };
    },
  },
];

function tangentAngle(pointAt, angle) {
  const here = pointAt(angle);
  const ahead = pointAt(angle - 0.01);
  return Math.atan2(ahead.y - here.y, ahead.x - here.x);
}

function buildTrack(definition) {
  const centerline = Array.from({ length: SAMPLE_COUNT }, (_, index) =>
    definition.pointAt((index / SAMPLE_COUNT) * Math.PI * 2));
  const checkpoints = CHECKPOINT_ANGLES.map((angle, index) => ({
    ...definition.pointAt(angle),
    radius: 68,
    label: index === 3 ? 'Finish' : `Checkpoint ${index + 1}`,
  }));
  const start = definition.pointAt(Math.PI / 2);
  const angle = tangentAngle(definition.pointAt, Math.PI / 2);
  const normalX = -Math.sin(angle);
  const normalY = Math.cos(angle);

  return {
    id: definition.id,
    name: definition.name,
    description: definition.description,
    centerX: 500,
    centerY: 310,
    roadWidth: ROAD_WIDTH,
    centerline,
    checkpoints,
    start,
    startAngle: angle,
    startLine: [
      { x: start.x - normalX * ROAD_WIDTH / 2, y: start.y - normalY * ROAD_WIDTH / 2 },
      { x: start.x + normalX * ROAD_WIDTH / 2, y: start.y + normalY * ROAD_WIDTH / 2 },
    ],
  };
}

const TRACKS = new Map(MAP_DEFINITIONS.map((definition) => [
  definition.id,
  buildTrack(definition),
]));

export const MAPS = MAP_DEFINITIONS.map(({ id, name, description }) => ({ id, name, description }));

export function getTrack(mapId = DEFAULT_MAP_ID) {
  const track = TRACKS.get(mapId);
  if (!track) throw new GameError('Choose one of the available race maps.', 'INVALID_MAP');
  return track;
}

export const TRACK = getTrack();

export function createCar(playerId, nickname, index, track = TRACK) {
  const offset = (index - 3) * 18;
  return {
    id: playerId,
    nickname,
    color: COLORS[index % COLORS.length],
    x: track.start.x + Math.cos(track.startAngle) * offset,
    y: track.start.y + Math.sin(track.startAngle) * offset,
    angle: track.startAngle,
    speed: 0,
    throttle: false,
    brake: false,
    steer: 0,
    lap: 0,
    checkpointIndex: 0,
    finishedAt: null,
    finishPosition: null,
    disconnected: false,
  };
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const projection = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + projection * dx), point.y - (start.y + projection * dy));
}

function isOnTrack(point, track) {
  const { centerline, roadWidth } = track;
  for (let index = 0; index < centerline.length; index += 1) {
    const next = centerline[(index + 1) % centerline.length];
    if (distanceToSegment(point, centerline[index], next) <= roadWidth / 2) return true;
  }
  return false;
}

function distanceTo(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function stepCar(car, deltaSeconds, track = TRACK) {
  if (car.finishedAt !== null || car.disconnected) return;

  const acceleration = car.throttle ? 250 : 0;
  const braking = car.brake ? 340 : 0;
  car.speed += (acceleration - braking) * deltaSeconds;
  car.speed *= 1 - 0.72 * deltaSeconds;
  car.speed = Math.max(-65, Math.min(250, car.speed));

  car.angle += car.steer * 2.7 * deltaSeconds * Math.sign(car.speed || 1);

  const next = {
    x: car.x + Math.cos(car.angle) * car.speed * deltaSeconds,
    y: car.y + Math.sin(car.angle) * car.speed * deltaSeconds,
  };
  if (isOnTrack(next, track)) {
    car.x = next.x;
    car.y = next.y;
  } else {
    car.speed = 0;
  }
}

export function updateCheckpoints(car, now, finishingOrder, track = TRACK) {
  if (car.finishedAt !== null || car.disconnected) return false;
  const checkpoint = track.checkpoints[car.checkpointIndex];
  if (distanceTo(car, checkpoint) > checkpoint.radius) return false;

  car.checkpointIndex += 1;
  if (car.checkpointIndex < track.checkpoints.length) return true;

  car.checkpointIndex = 0;
  car.lap += 1;
  if (car.lap >= LAPS_TO_WIN) {
    car.finishedAt = now;
    car.finishPosition = finishingOrder.length + 1;
    finishingOrder.push(car.id);
  }
  return true;
}

export function getRaceOrder(cars, finishingOrder, track = TRACK) {
  const finishRank = new Map(finishingOrder.map((id, index) => [id, index]));
  return [...cars].sort((a, b) => {
    if (a.finishedAt !== null || b.finishedAt !== null) {
      if (a.finishedAt === null) return 1;
      if (b.finishedAt === null) return -1;
      return finishRank.get(a.id) - finishRank.get(b.id);
    }

    const progressA = a.lap * track.checkpoints.length + a.checkpointIndex;
    const progressB = b.lap * track.checkpoints.length + b.checkpointIndex;
    if (progressA !== progressB) return progressB - progressA;
    return distanceTo(a, track.checkpoints[a.checkpointIndex]) -
      distanceTo(b, track.checkpoints[b.checkpointIndex]);
  });
}

export function validateControls(controls) {
  if (!controls || typeof controls !== 'object' || Array.isArray(controls)) {
    throw new GameError('Invalid driving controls.');
  }
  const keys = Object.keys(controls);
  if (keys.length !== 3 || !keys.includes('throttle') || !keys.includes('brake') || !keys.includes('steer')) {
    throw new GameError('Invalid driving controls.');
  }
  if (typeof controls.throttle !== 'boolean' || typeof controls.brake !== 'boolean' ||
      ![-1, 0, 1].includes(controls.steer)) {
    throw new GameError('Invalid driving controls.');
  }
  return controls;
}
