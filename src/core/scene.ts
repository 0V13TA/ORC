import type Observer from "./observer";
import type { Boundary, RayHit, Sector, Vector2D } from "./Types";
import { Vector2 } from "./utils";

export default class Scene {
  observer: Observer;
  sectors: Sector[];

  constructor(observer: Observer) {
    this.sectors = [];
    this.observer = observer;
  }

  createSector(floorHeight: number, ceilingHeight: number) {
    const sector: Sector = { boundaries: [], ceilingHeight, floorHeight };
    this.sectors.push(sector);
    return sector;
  }

  addBoundary(sector: Sector, boundary: Boundary) {
    sector.boundaries.push(boundary);
  }

  castRay(currentRayAngle: number): RayHit | null {
    const currentSector = this.observer.currentSector;
    if (!currentSector) return null;

    let rayHit: RayHit | null = null;
    const rayStart = this.observer.position;

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
        if (u > this.observer.viewDistance) continue; // Skip if beyond view distance

        if (u < recordDistance) {
          recordDistance = u;

          const hitPoint = Vector2.createVector(px + u * dx, py + u * dy);
          const wallLength = Vector2.distance(wall.start, wall.end);
          const hitOffset = Vector2.distance(wall.start, hitPoint);

          closestHit = {
            boundary: wall,
            distance: u, // Store corrected distance for clean render proportions
            point: hitPoint,
            u: wallLength === 0 ? 0 : hitOffset / wallLength, // Normalize texture coordinate mapping
          };
        }
      }

      if (closestHit) {
        rayHit = closestHit;
      }
    }

    return rayHit;
  }

  getSectorAtPosition(point: Vector2D): Sector | null {
    for (const sector of this.sectors) {
      let inside = false;
      for (const wall of sector.boundaries) {
        const x1 = wall.start.x;
        const y1 = wall.start.y;
        const x2 = wall.end.x;
        const y2 = wall.end.y;

        // Check intersection of a horizontal baseline projection cutting across sector walls
        const intersect =
          y1 > point.y !== y2 > point.y &&
          point.x < ((x2 - x1) * (point.y - y1)) / (y2 - y1) + x1;

        if (intersect) inside = !inside;
      }
      if (inside) return sector;
    }
    return null;
  }
}
