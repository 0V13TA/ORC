import type Observer from "./observer";
import type { Boundary, RayHit, Sector } from "./Types";
import { Vector2, toRadians } from "./utils";

export default class Scene {
  observer: Observer;
  sectors: Sector[];
  screenWidth: number;
  screenHeigth: number;

  constructor(observer: Observer, screenWidth: number, screenHeight: number) {
    this.sectors = [];
    this.observer = observer;
    this.screenWidth = screenWidth;
    this.screenHeigth = screenHeight;
  }

  createSector(floorHeight: number, ceilingHeight: number) {
    const sector: Sector = { boundaries: [], ceilingHeight, floorHeight };
    this.sectors.push(sector);
    return sector;
  }

  addBoundary(sector: Sector, boundary: Boundary) {
    sector.boundaries.push(boundary);
  }

  castRays(): RayHit[] {
    const currentSector = this.observer.currentSector;
    if (!currentSector) return [];

    const rayHits: RayHit[] = [];
    const rayStart = this.observer.position;

    // Convert observer forward angle to radians
    const centerAngle = toRadians(this.observer.dirAngle);
    const halfFov = toRadians(this.observer.fov / 2);

    // Calculate start and end bounds of the FOV cone arc
    const startAngle = centerAngle - halfFov;
    const angleStep = toRadians(this.observer.fov) / this.screenWidth;

    // Cast an individual ray line projection for each vertical screen column slice
    for (let i = 0; i < this.screenWidth; i++) {
      const currentRayAngle = startAngle + i * angleStep;

      // Generate a unit direction vector for this specific column ray
      const rayDir = Vector2.fromAngle(currentRayAngle);

      let closestHit: RayHit | null = null;
      let recordDistance = Infinity;

      for (const wall of currentSector.boundaries) {
        // Wall vector components: Line segment (A to B)
        const x1 = wall.start.x;
        const y1 = wall.start.y;
        const x2 = wall.end.x;
        const y2 = wall.end.y;

        // Ray vector components: Ray origin (P) + Direction vector (D)
        const px = rayStart.x;
        const py = rayStart.y;
        const dx = rayDir.x;
        const dy = rayDir.y;

        // Cramer's rule intersection formula determinant
        const denominator = (x1 - x2) * dy - (y1 - y2) * dx;
        if (denominator === 0) continue; // Ray and wall run parallel

        // t = interpolation parameter along the wall line segment (0 <= t <= 1)
        const t = ((x1 - px) * dy - (y1 - py) * dx) / denominator;

        // u = distance along the projected directional ray vector
        const u = ((x1 - x2) * (y1 - py) - (y1 - y2) * (x1 - px)) / denominator;

        // Valid intersection occurs forward along the ray (u > 0) and within segment bounds
        if (t >= 0 && t <= 1 && u > 0) {
          if (u < recordDistance) {
            recordDistance = u;

            // Correct for fish-eye lens distortion effect
            const beta = currentRayAngle - centerAngle;
            const correctedDistance = u * Math.cos(beta);

            const hitPoint = Vector2.createVector(px + u * dx, py + u * dy);
            const wallLength = Vector2.distance(wall.start, wall.end);
            const hitOffset = Vector2.distance(wall.start, hitPoint);

            closestHit = {
              boundary: wall,
              distance: correctedDistance, // Store corrected distance for clean render proportions
              point: hitPoint,
              u: wallLength === 0 ? 0 : hitOffset / wallLength, // Normalize texture coordinate mapping
            };
          }
        }
      }

      if (closestHit) {
        rayHits.push(closestHit);
      }
    }

    return rayHits;
  }
}
