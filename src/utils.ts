import {
  type Boundary,
  type BoxEntity,
  type Color,
  type contextType,
  type DEGREES,
  type KeyCode,
  type Material,
  type RADIANS,
  type Sector,
  type Texture,
  type Vector2D,
} from "./Types";

interface Timer {
  id: number;
  elapsed: number;
  paused: boolean;
  repeat: boolean;
  interval: number;
  callback: () => void;
}

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

export const toRadians = (x: DEGREES): RADIANS => x * DEG2RAD;
export const toDegrees = (x: RADIANS): DEGREES => x * RAD2DEG;

// --- Timer Manager ---
export const TimerManager = {
  timers: [] as Timer[],
  counterId: 0,

  add(interval: number, callback: () => void, repeat: boolean = true): number {
    const id = this.counterId++;
    this.timers.push({
      id,
      interval,
      callback,
      elapsed: 0,
      paused: false,
      repeat,
    });
    return id;
  },

  setInterval(interval: number, callback: () => void): number {
    return this.add(interval, callback, true);
  },

  update(dt: number): void {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      if (t.paused) continue;

      t.elapsed += dt;
      if (t.elapsed >= t.interval) {
        t.callback();
        if (t.repeat) {
          t.elapsed -= t.interval;
        } else {
          this.timers.splice(i, 1);
        }
      }
    }
  },

  clearAll(): void {
    this.timers = [];
    this.counterId = 0;
  },
};

// --- Input Handling ---
export const Input = {
  held: new Set<KeyCode>(),
  pressed: new Set<KeyCode>(),
  released: new Set<KeyCode>(),

  init(): void {
    window.addEventListener("keydown", (e: KeyboardEvent) => {
      if (!this.held.has(e.code as KeyCode)) {
        this.pressed.add(e.code as KeyCode);
      }
      this.held.add(e.code as KeyCode);
    });

    window.addEventListener("keyup", (e: KeyboardEvent) => {
      this.held.delete(e.code as KeyCode);
      this.released.add(e.code as KeyCode);
    });
  },

  isHeld(key: KeyCode): boolean {
    return this.held.has(key);
  },

  isPressed(key: KeyCode): boolean {
    return this.pressed.has(key);
  },

  isReleased(key: KeyCode): boolean {
    return this.released.has(key);
  },

  endFrame(): void {
    this.pressed.clear();
    this.released.clear();
  },
};

// --- Collision Logic ---
export function checkCollisionBoxes(a: BoxEntity, b: BoxEntity): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function checkCollisionCircleRec(
  circleCenter: Vector2D,
  radius: number,
  rect: BoxEntity,
) {
  let collision = false;

  let recCenterX = rect.x + rect.width / 2;
  let recCenterY = rect.y + rect.height / 2;

  let dx = Math.abs(circleCenter.x - recCenterX);
  let dy = Math.abs(circleCenter.y - recCenterY);

  if (dx <= rect.width / 2 + radius && dy <= rect.height / 2 + radius) {
    if (dx <= rect.width / 2) collision = true;
    else if (dy <= rect.height / 2) collision = true;
    else {
      let cornerDistanceSq =
        (dx - rect.width / 2) * (dx - rect.width / 2) +
        (dy - rect.height / 2) * (dy - rect.height / 2);
      collision = cornerDistanceSq <= radius * radius;
    }
  }

  return collision;
}

export function circleLineCollision(
  playerPos: Vector2D,
  radius: number,
  wallStart: Vector2D,
  wallEnd: Vector2D,
): Vector2D {
  const x1 = wallStart.x;
  const y1 = wallStart.y;
  const x2 = wallEnd.x;
  const y2 = wallEnd.y;
  const px = playerPos.x;
  const py = playerPos.y;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const segmentLengthSq = dx * dx + dy * dy;

  // Line is a single point, no displacement needed
  if (segmentLengthSq === 0) return Vector2.createVector(0, 0);

  // Project player position onto the line segment to find the closest point
  let t = ((px - x1) * dx + (py - y1) * dy) / segmentLengthSq;
  t = Math.max(0, Math.min(1, t)); // Clamp to stay strictly on the line segment

  const closestPoint = Vector2.createVector(x1 + t * dx, y1 + t * dy);
  const offsets = Vector2.subtract(playerPos, closestPoint);
  const distance = Vector2.magnitude(offsets);

  // If the distance to the wall is less than the player's radius, resolve it
  if (distance < radius) {
    const overlap = radius - distance;

    // Handle corner edge case where distance is zero to avoid division by zero
    if (distance === 0) {
      return Vector2.createVector(0, 0);
    }

    const pushDirection = Vector2.createVector(
      offsets.x / distance,
      offsets.y / distance,
    );
    return Vector2.scale(pushDirection, overlap); // Return displacement delta
  }

  // Return zero vector if no collision occurs
  return Vector2.createVector(0, 0);
}

// --- Assests, Drawing and Canvas --
export function createCanvas(
  width: number,
  height: number,
  element: HTMLElement = document.body,
) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  canvas.width = width;
  canvas.height = height;
  element.appendChild(canvas);
  return { canvas, ctx };
}

export function drawLine(
  start: Vector2D,
  end: Vector2D,
  width: number,
  color: Color,
  ctx: contextType,
) {
  ctx.save();
  ctx.beginPath();
  ctx.lineWidth = width;
  ctx.strokeStyle = color.css;
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.restore();
}

export function loadTexture(src: string): Promise<Texture> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // Prevents DOMException when reading pixel data locally
    img.src = src;

    img.onload = () => {
      const width = img.width;
      const height = img.height;

      // Create an offscreen canvas to extract pixel data
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error(`Could not get 2D context for texture: ${src}`));
        return;
      }

      // Draw image and grab the raw RGBA buffer
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, width, height);
      const pixelData = imgData.data;

      // Pre-slice the pixel data into vertical columns (1px wide x height tall)
      // Each element in a column represents 4 bytes: [R, G, B, A]
      const pixelColumns: Uint8ClampedArray[][] = [];

      for (let x = 0; x < width; x++) {
        const column: Uint8ClampedArray[] = [];

        for (let y = 0; y < height; y++) {
          // Calculate index inside the flat 1D pixelData array
          const pixelIndex = (y * width + x) * 4;

          const r = pixelData[pixelIndex];
          const g = pixelData[pixelIndex + 1];
          const b = pixelData[pixelIndex + 2];
          const a = pixelData[pixelIndex + 3];

          column.push(new Uint8ClampedArray([r, g, b, a]));
        }

        pixelColumns.push(column);
      }

      resolve({
        src,
        width,
        height,
        pixelData,
        pixelColumns,
      });
    };

    img.onerror = () => {
      reject(new Error(`Failed to load texture image at path: ${src}`));
    };
  });
}

// --- Miscellaneous --
export function createColor(
  r: number,
  g: number,
  b: number,
  a: number = 255,
): Color {
  // Clamp values only once during creation
  const clamp = (val: number) => Math.max(0, Math.min(255, Math.round(val)));
  const clR = clamp(r);
  const clG = clamp(g);
  const clB = clamp(b);
  const clA = clamp(a);

  return {
    r: clR,
    g: clG,
    b: clB,
    a: clA,
    css: `rgba(${clR}, ${clG}, ${clB}, ${clA / 255})`,
  };
}

// Pre-compute constants so they never allocate memory during the render loop
export const Colors = {
  red: createColor(255, 0, 0),
  green: createColor(0, 255, 0),
  blue: createColor(0, 0, 255),
  white: createColor(255, 255, 255),
  black: createColor(0, 0, 0),
};

export function linkSectorsViaPortal(
  sectorA: Sector,
  sectorB: Sector,
  start: Vector2D,
  end: Vector2D,
  material: Material,
) {
  const boundA: Boundary = {
    start,
    end,
    material,
    isPortal: true,
    targetSector: sectorB,
  };
  const boundB: Boundary = {
    start,
    end,
    material,
    isPortal: true,
    targetSector: sectorA,
  };

  boundA.portalTo = boundB;
  boundB.portalTo = boundA;

  sectorA.boundaries.push(boundA);
  sectorB.boundaries.push(boundB);
}

// --- Vectors ---
export class Vector2 {
  static createVector(x: number = 0, y: number = 0): Vector2D {
    return { x, y };
  }

  // -------------------------
  // Arithmetic
  // -------------------------

  static add(v1: Vector2D, v2: Vector2D): Vector2D {
    return this.createVector(v1.x + v2.x, v1.y + v2.y);
  }

  static subtract(v1: Vector2D, v2: Vector2D): Vector2D {
    return this.createVector(v1.x - v2.x, v1.y - v2.y);
  }

  static multiply(v1: Vector2D, v2: Vector2D): Vector2D {
    return this.createVector(v1.x * v2.x, v1.y * v2.y);
  }

  static divide(v1: Vector2D, v2: Vector2D): Vector2D {
    return this.createVector(v1.x / v2.x, v1.y / v2.y);
  }

  static scale(v: Vector2D, scalar: number): Vector2D {
    return this.createVector(v.x * scalar, v.y * scalar);
  }

  static negated(v: Vector2D): Vector2D {
    return this.createVector(-v.x, -v.y);
  }

  // -------------------------
  // Angles
  // -------------------------

  static fromAngle(angle: RADIANS): Vector2D {
    return this.createVector(Math.cos(angle), Math.sin(angle));
  }

  static toAngle(v: Vector2D): RADIANS {
    return Math.atan2(v.y, v.x);
  }

  // -------------------------
  // Magnitude
  // -------------------------

  static magnitude(v: Vector2D): number {
    return Math.sqrt(this.magnitudeSquared(v));
  }

  static magnitudeSquared(v: Vector2D): number {
    return v.x * v.x + v.y * v.y;
  }

  // -------------------------
  // Distance
  // -------------------------

  static distanceSquared(v1: Vector2D, v2: Vector2D): number {
    const dx = v2.x - v1.x;
    const dy = v2.y - v1.y;

    return dx * dx + dy * dy;
  }

  static distance(v1: Vector2D, v2: Vector2D): number {
    return Math.sqrt(this.distanceSquared(v1, v2));
  }

  // -------------------------
  // Normalization
  // -------------------------

  static normalized(v: Vector2D): Vector2D {
    const mag = this.magnitude(v);

    if (mag === 0) {
      return this.createVector(0, 0);
    }

    return this.createVector(v.x / mag, v.y / mag);
  }

  // -------------------------
  // Products
  // -------------------------

  static dot(v1: Vector2D, v2: Vector2D): number {
    return v1.x * v2.x + v1.y * v2.y;
  }

  // 2D cross product returns scalar
  static cross(v1: Vector2D, v2: Vector2D): number {
    return v1.x * v2.y - v1.y * v2.x;
  }

  // -------------------------
  // Rotation
  // -------------------------

  static rotate(v: Vector2D, angle: RADIANS): Vector2D {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    return this.createVector(v.x * cos - v.y * sin, v.x * sin + v.y * cos);
  }

  // -------------------------
  // Interpolation
  // -------------------------

  static lerp(v1: Vector2D, v2: Vector2D, time: number): Vector2D {
    return this.createVector(
      v1.x + (v2.x - v1.x) * time,
      v1.y + (v2.y - v1.y) * time,
    );
  }

  // -------------------------
  // Clamp
  // -------------------------

  static clamp(target: Vector2D, min: Vector2D, max: Vector2D): Vector2D {
    return this.createVector(
      Math.max(min.x, Math.min(target.x, max.x)),
      Math.max(min.y, Math.min(target.y, max.y)),
    );
  }

  // -------------------------
  // Comparison
  // -------------------------

  static approximatelyEquals(
    v1: Vector2D,
    v2: Vector2D,
    bounds: number = 0.00001,
  ): boolean {
    return Math.abs(v1.x - v2.x) <= bounds && Math.abs(v1.y - v2.y) <= bounds;
  }

  static isZero(v: Vector2D) {
    return v.x === 0 && v.y === 0;
  }
}
