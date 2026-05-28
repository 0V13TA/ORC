import type Observer from "./observer";
import type { Boundary, LightSource, RayHit, Sector, Vector2D } from "./Types";
import { Vector2 } from "./utils";

export default class Scene {
  observer: Observer;
  sectors: Sector[];
  lights: LightSource[] = [];

  constructor(observer: Observer) {
    this.sectors = [];
    this.observer = observer;
  }

  addLight(light: LightSource): void {
    this.lights.push(light);
  }

  removeLight(id: string): void {
    this.lights = this.lights.filter((l) => l.id !== id);
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
    if (!this.observer.currentSector) return null;
    const rayDir = Vector2.fromAngle(currentRayAngle);

    let currentSector = this.observer.currentSector;
    let ignoreWall: Boundary | undefined = undefined;
    let safety = 0;

    while (currentSector && safety < 10) {
      safety++;
      const hit = this.castRayInSector(
        this.observer.position,
        rayDir,
        currentSector,
        this.observer.viewDistance,
        ignoreWall,
      );
      if (!hit) return null;

      if (hit.boundary.isPortal && hit.boundary.targetSector) {
        ignoreWall = hit.boundary;
        currentSector = hit.boundary.targetSector;
      } else {
        return hit;
      }
    }
    return null;
  }

  castRayInSector(
    rayStart: Vector2D,
    rayDir: Vector2D,
    sector: Sector,
    viewDistance: number,
    ignoreBoundary?: Boundary,
  ): RayHit | null {
    let closestHit: RayHit | null = null;
    let recordDistance = Infinity;

    for (const wall of sector.boundaries) {
      // Avoid hitting the back of the portal we just stepped through
      if (
        ignoreBoundary &&
        (wall === ignoreBoundary || wall === ignoreBoundary.portalTo)
      ) {
        continue;
      }

      const x1 = wall.start.x;
      const y1 = wall.start.y;
      const x2 = wall.end.x;
      const y2 = wall.end.y;

      const px = rayStart.x;
      const py = rayStart.y;
      const dx = rayDir.x;
      const dy = rayDir.y;

      const denominator = (x1 - x2) * dy - (y1 - y2) * dx;
      if (denominator === 0) continue;

      const t = ((x1 - px) * dy - (y1 - py) * dx) / denominator;
      const u = ((x1 - x2) * (y1 - py) - (y1 - y2) * (x1 - px)) / denominator;

      if (t >= 0 && t <= 1 && u > 0) {
        if (u > viewDistance) continue;

        if (u < recordDistance) {
          recordDistance = u;

          const hitPoint = Vector2.createVector(px + u * dx, py + u * dy);
          const wallLength = Vector2.distance(wall.start, wall.end);
          const hitOffset = Vector2.distance(wall.start, hitPoint);

          closestHit = {
            boundary: wall,
            distance: u,
            point: hitPoint,
            u: wallLength === 0 ? 0 : hitOffset / wallLength,
          };
        }
      }
    }

    return closestHit;
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
