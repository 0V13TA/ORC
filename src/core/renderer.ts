import type Scene from "./scene";
import type { RADIANS, Vector2D, Boundary } from "./Types";
import { toRadians, Vector2 } from "./utils";

export default class Renderer {
  ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;

  private screenImageData: ImageData; // for software blitting
  private pixelBuffer: Uint32Array; // for software blitting

  public depthBuffer: Float32Array; // for depth sorting and occlusion

  constructor(ctx: CanvasRenderingContext2D, width: number, height: number) {
    this.ctx = ctx;
    this.width = width;
    this.height = height;

    this.screenImageData = ctx.createImageData(this.width, this.height);

    // Bind a 32-bit unsigned integer view over the byte buffer
    // This allows us to paint an entire RGBA pixel with a single numeric write!
    this.pixelBuffer = new Uint32Array(this.screenImageData.data.buffer);
    this.depthBuffer = new Float32Array(this.width);
  }

  private getBoundaryNormal(start: Vector2D, end: Vector2D) {
    const d = Vector2.subtract(end, start);
    const perpendicularVector = Vector2.createVector(-d.y, d.x);

    const length = Vector2.magnitude(perpendicularVector);
    if (length === 0) return Vector2.createVector();
    return Vector2.normalized(perpendicularVector);
  }

  public render(scene: Scene) {
    const observer = scene.observer;

    this.pixelBuffer.fill(0xff000000); // Clear to opaque black
    this.depthBuffer.fill(Infinity); // Reset depth buffer for this frame

    const centerAngle = toRadians(observer.dirAngle);
    const halfFOV = toRadians(observer.fov / 2);

    const startAngle = centerAngle - halfFOV;
    const angleStep = toRadians(observer.fov) / this.width;
    const projectionDistance = this.width / 2 / Math.tan(halfFOV);

    // -- MULTI-SECTOR WALL ENVIRONMENT SWEEP PASSTHROUGH ---
    for (let column = 0; column < this.width; column++) {
      const rayAngle: RADIANS = startAngle + column * angleStep;
      const rayDir = Vector2.fromAngle(rayAngle);

      if (!observer.currentSector) continue;

      // Initialize screen clipping constraints for this column
      let sector = observer.currentSector;
      let clipTop = 0;
      let clipBottom = this.height - 1;
      let ignoreWall: Boundary | undefined = undefined;
      let safetyCounter = 0;

      const beta = rayAngle - centerAngle;
      const cosBeta = Math.cos(beta);
      const screenYCenter = this.height / 2 + observer.pitch;
      const eyeZ = observer.z + observer.height;

      // Iteratively trace deeper into rooms via connected portal apertures
      while (sector && safetyCounter < 10) {
        safetyCounter++;

        // Leverage your scene's single-sector intercept finder directly!
        const rayHit = scene.castRayInSector(
          observer.position,
          rayDir,
          sector,
          observer.viewDistance,
          ignoreWall,
        );
        if (rayHit === null) break;

        const correctedDistance = rayHit.distance * cosBeta;

        // Establish layout dimensions for the sector we are currently looking at
        const relativeCeiling = sector.ceilingHeight - eyeZ;
        const relativeFloor = sector.floorHeight - eyeZ;

        const ceilingScreenY = Math.round(
          screenYCenter -
            (relativeCeiling / correctedDistance) * projectionDistance,
        );
        const floorScreenY = Math.round(
          screenYCenter -
            (relativeFloor / correctedDistance) * projectionDistance,
        );

        // Render ceiling/floor backgrounds if this is the observer's immediate perspective context
        if (safetyCounter === 1 && this.depthBuffer[column] === Infinity) {
          this.depthBuffer[column] = correctedDistance;
        }

        if (rayHit.boundary.isPortal && rayHit.boundary.targetSector) {
          const nextSector = rayHit.boundary.targetSector;

          // Project screen bounds for the adjacent neighbor sector geometry heights
          const nextRelativeCeiling = nextSector.ceilingHeight - eyeZ;
          const nextRelativeFloor = nextSector.floorHeight - eyeZ;

          const nextCeilingScreenY = Math.round(
            screenYCenter -
              (nextRelativeCeiling / correctedDistance) * projectionDistance,
          );
          const nextFloorScreenY = Math.round(
            screenYCenter -
              (nextRelativeFloor / correctedDistance) * projectionDistance,
          );

          // 1. Draw Upper Wall (Ceiling step-downs)
          const upperTop = Math.max(
            clipTop,
            Math.min(clipBottom, ceilingScreenY),
          );
          const upperBottom = Math.max(
            clipTop,
            Math.min(clipBottom, nextCeilingScreenY),
          );
          if (upperBottom > upperTop) {
            this.drawVerticalStrip(
              column,
              upperTop,
              upperBottom,
              ceilingScreenY,
              floorScreenY,
              rayHit,
              correctedDistance,
              scene,
              eyeZ,
              screenYCenter,
              projectionDistance,
            );
          }

          // 2. Draw Lower Wall (Floor step-ups / ledges)
          const lowerTop = Math.max(
            clipTop,
            Math.min(clipBottom, nextFloorScreenY),
          );
          const lowerBottom = Math.max(
            clipTop,
            Math.min(clipBottom, floorScreenY),
          );
          if (lowerBottom > lowerTop) {
            this.drawVerticalStrip(
              column,
              lowerTop,
              lowerBottom,
              ceilingScreenY,
              floorScreenY,
              rayHit,
              correctedDistance,
              scene,
              eyeZ,
              screenYCenter,
              projectionDistance,
            );
          }

          // Shrink the screen clipping boundaries to match the look-through open window of the portal
          clipTop = Math.max(
            clipTop,
            Math.min(nextCeilingScreenY, this.height - 1),
          );
          clipBottom = Math.min(clipBottom, Math.max(nextFloorScreenY, 0));

          // If our window limits completely cross over, our view is totally occluded
          if (clipTop >= clipBottom) break;

          // Step through the portal into the next sector context
          ignoreWall = rayHit.boundary;
          sector = nextSector;
        } else {
          // Solid Wall reached! Draw it fully restricted to remaining clipping coordinates
          const wallTop = Math.max(
            clipTop,
            Math.min(clipBottom, ceilingScreenY),
          );
          const wallBottom = Math.max(
            clipTop,
            Math.min(clipBottom, floorScreenY),
          );

          if (wallBottom > wallTop) {
            this.drawVerticalStrip(
              column,
              wallTop,
              wallBottom,
              ceilingScreenY,
              floorScreenY,
              rayHit,
              correctedDistance,
              scene,
              eyeZ,
              screenYCenter,
              projectionDistance,
            );
          }
          break; // Completely occluded behind a solid architectural surface
        }
      }
    }

    this.ctx.putImageData(this.screenImageData, 0, 0);
  }

  /**
   * Encapsulated utility method to handle texturing, 3D pixel height mapping, and point-light equations
   */
  private drawVerticalStrip(
    column: number,
    startY: number,
    endY: number,
    ceilingScreenY: number,
    floorScreenY: number,
    rayHit: any,
    correctedDistance: number,
    scene: Scene,
    eyeZ: number,
    screenYCenter: number,
    projectionDistance: number,
  ) {
    const wallScreenHeight = floorScreenY - ceilingScreenY;
    if (wallScreenHeight <= 0) return;

    const material = rayHit.boundary.material;
    const observer = scene.observer;

    // --- PER-COLUMN GEOMETRY & LIGHT CULLING PREPARATIONS ---
    const normal = this.getBoundaryNormal(
      rayHit.boundary.start,
      rayHit.boundary.end,
    );

    const audibleLights = [];
    for (const light of scene.lights) {
      const dx = light.position.x - rayHit.point.x;
      const dy = light.position.y - rayHit.point.y;
      const distance2DSq = dx * dx + dy * dy;

      if (distance2DSq < light.radius * light.radius) {
        const distance2D = Math.sqrt(distance2DSq) || 1;
        audibleLights.push({
          light,
          dx,
          dy,
          distance2DSq,
          distance2D,
          lightDirX: dx / distance2D,
          lightDirY: dy / distance2D,
        });
      }
    }

    const fogFactor = Math.max(
      0,
      Math.min(1, correctedDistance / observer.viewDistance),
    );
    const visibility = 1.0 - fogFactor;

    // Render loop across the assigned screen height slice boundaries
    for (let y = startY; y <= endY; y++) {
      let baseR = 0,
        baseG = 255,
        baseB = 204,
        a = 255;

      const yOffset = y - ceilingScreenY;

      if (material.texture) {
        const tex = material.texture;
        const repeatX = material.repeat ? material.repeat.x : 1;
        const texX = Math.floor((rayHit.u * repeatX * tex.width) % tex.width);
        const textureColumn = tex.pixelColumns[texX];

        let texY = Math.floor((yOffset / wallScreenHeight) * tex.height);
        texY = Math.max(0, Math.min(tex.height - 1, texY));

        baseR = textureColumn[texY][0];
        baseG = textureColumn[texY][1];
        baseB = textureColumn[texY][2];
        a = textureColumn[texY][3];
      } else if (material.solidColor) {
        baseR = material.solidColor.r;
        baseG = material.solidColor.g;
        baseB = material.solidColor.b;
        a = material.solidColor.a;
      }

      // --- 3D REVERSE-PROJECTION HEIGHT MAPPING ---
      const relativeZ =
        ((screenYCenter - y) * correctedDistance) / projectionDistance;
      const pixelWorldZ = relativeZ + eyeZ;

      // Standard non-lit environment ambient baseline brightness
      let litR = 0.12;
      let litG = 0.12;
      let litB = 0.12;

      // --- ACCUMULATE LIGHT RADIANCE VECTORS PER-PIXEL ---
      for (const active of audibleLights) {
        const light = active.light;
        const dz = light.z - pixelWorldZ;
        const distance3D = Math.sqrt(active.distance2DSq + dz * dz);

        if (distance3D >= light.radius) continue;

        const attenuation = (1.0 - distance3D / light.radius) * light.intensity;
        const dotFactor = Math.abs(
          normal.x * active.lightDirX + normal.y * active.lightDirY,
        );

        const totalScalar = dotFactor * attenuation;
        litR += (light.color.r / 255) * totalScalar;
        litG += (light.color.g / 255) * totalScalar;
        litB += (light.color.b / 255) * totalScalar;
      }

      const r = Math.min(255, Math.round(baseR * litR * visibility));
      const g = Math.min(255, Math.round(baseG * litG * visibility));
      const b = Math.min(255, Math.round(baseB * litB * visibility));

      const packedColor = (a << 24) | (b << 16) | (g << 8) | r;
      const bufferIndex = y * this.width + column;
      this.pixelBuffer[bufferIndex] = packedColor;
    }
  }
}
