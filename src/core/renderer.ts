import type Scene from "./scene";
import type { RADIANS, Vector2D, Boundary, Sector } from "./Types";
import { toRadians, Vector2 } from "./utils";

export default class Renderer {
  ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;

  private screenImageData: ImageData;
  private pixelBuffer: Uint32Array;
  public depthBuffer: Float32Array;

  constructor(ctx: CanvasRenderingContext2D, width: number, height: number) {
    this.ctx = ctx;
    this.width = width;
    this.height = height;

    this.screenImageData = ctx.createImageData(this.width, this.height);
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

    this.pixelBuffer.fill(0xff000000); // Clear screen buffer to solid opaque black
    this.depthBuffer.fill(Infinity);

    const centerAngle = toRadians(observer.dirAngle);
    const halfFOV = toRadians(observer.fov / 2);

    const startAngle = centerAngle - halfFOV;
    const angleStep = toRadians(observer.fov) / this.width;
    const projectionDistance = this.width / 2 / Math.tan(halfFOV);

    // --- COLUMN VIEWPORT SWEEPING PASSTHROUGH ---
    for (let column = 0; column < this.width; column++) {
      const rayAngle: RADIANS = startAngle + column * angleStep;
      const rayDir = Vector2.fromAngle(rayAngle);
      const beta = rayAngle - centerAngle;
      const cosBeta = Math.cos(beta);

      if (!observer.currentSector) continue;

      let sector: Sector | null = observer.currentSector;
      let clipTop = 0;
      let clipBottom = this.height - 1;
      let ignoreWall: Boundary | undefined = undefined;
      let safetyCounter = 0;

      // Factoring observer pitch straight into the drawing center shear!
      const screenYCenter = this.height / 2 + observer.pitch;
      const eyeZ = observer.z + observer.height;

      while (sector && safetyCounter < 10) {
        safetyCounter++;

        const rayHit = scene.castRayInSector(
          observer.position,
          rayDir,
          sector,
          observer.viewDistance,
          ignoreWall,
        );
        if (rayHit === null) break;

        const correctedDistance = rayHit.distance * cosBeta;

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

        if (safetyCounter === 1) {
          this.depthBuffer[column] = correctedDistance;
        }

        // 1. DRAW SECTOR CEILING PLANE SLICE
        const ceilTop = clipTop;
        const ceilBottom = Math.min(clipBottom, ceilingScreenY - 1);
        if (ceilBottom >= ceilTop && sector.ceilingMaterial) {
          this.drawHorizontalPlaneStrip(
            column,
            ceilTop,
            ceilBottom,
            sector.ceilingMaterial,
            sector.ceilingHeight,
            false,
            scene,
            eyeZ,
            screenYCenter,
            projectionDistance,
            rayDir,
            cosBeta,
          );
        }

        // 2. DRAW SECTOR FLOOR PLANE SLICE
        const flrTop = Math.max(clipTop, floorScreenY + 1);
        const flrBottom = clipBottom;
        if (flrBottom >= flrTop && sector.floorMaterial) {
          this.drawHorizontalPlaneStrip(
            column,
            flrTop,
            flrBottom,
            sector.floorMaterial,
            sector.floorHeight,
            true,
            scene,
            eyeZ,
            screenYCenter,
            projectionDistance,
            rayDir,
            cosBeta,
          );
        }

        // 3. PROCESS PORTAL TRANSITIONAL WALL STEP-CLOSURES
        if (rayHit.boundary.isPortal && rayHit.boundary.targetSector) {
          const nextSector = rayHit.boundary.targetSector;

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

          // Draw Upper Step Difference (Soffit drop-downs)
          const upperTop = Math.max(clipTop, ceilingScreenY);
          const upperBottom = Math.min(clipBottom, nextCeilingScreenY);
          if (upperBottom > upperTop) {
            this.drawVerticalWallStrip(
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

          // Draw Lower Step Difference (Floor rising ledges)
          const lowerTop = Math.max(clipTop, nextFloorScreenY);
          const lowerBottom = Math.min(clipBottom, floorScreenY);
          if (lowerBottom > lowerTop) {
            this.drawVerticalWallStrip(
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

          // Contract screen visibility boundaries down to portalLook window opening
          clipTop = Math.max(clipTop, nextCeilingScreenY);
          clipBottom = Math.min(clipBottom, nextFloorScreenY);

          if (clipTop >= clipBottom) break;

          ignoreWall = rayHit.boundary;
          sector = nextSector;
        } else {
          // Solid Architectural Surface reached! Draw it fully capped to visibility bounds
          const wallTop = Math.max(clipTop, ceilingScreenY);
          const wallBottom = Math.min(clipBottom, floorScreenY);

          if (wallBottom > wallTop) {
            this.drawVerticalWallStrip(
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
          break;
        }
      }
    }

    this.ctx.putImageData(this.screenImageData, 0, 0);
  }

  private drawVerticalWallStrip(
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

    for (let y = startY; y <= endY; y++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 255;
      const yOffset = y - ceilingScreenY;

      if (material.texture) {
        const tex = material.texture;
        const repeatX = material.repeat ? material.repeat.x : 1;
        const texX = Math.floor((rayHit.u * repeatX * tex.width) % tex.width);
        const textureColumn = tex.pixelColumns[texX];

        let texY = Math.floor((yOffset / wallScreenHeight) * tex.height);
        texY = Math.max(0, Math.min(tex.height - 1, texY));

        r = textureColumn[texY][0];
        g = textureColumn[texY][1];
        b = textureColumn[texY][2];
        a = textureColumn[texY][3];
      } else if (material.solidColor) {
        r = material.solidColor.r;
        g = material.solidColor.g;
        b = material.solidColor.b;
        a = material.solidColor.a;
      }

      // Reverse projection height equations matching the shearing center properties
      const relativeZ =
        ((screenYCenter - y) * correctedDistance) / projectionDistance;
      const pixelWorldZ = relativeZ + eyeZ;

      let litR = 0.08,
        litG = 0.08,
        litB = 0.08;

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

      r = Math.min(255, Math.round(r * litR * visibility));
      g = Math.min(255, Math.round(g * litG * visibility));
      b = Math.min(255, Math.round(b * litB * visibility));

      this.pixelBuffer[y * this.width + column] =
        (a << 24) | (b << 16) | (g << 8) | r;
    }
  }

  private drawHorizontalPlaneStrip(
    column: number,
    startY: number,
    endY: number,
    material: any,
    planeHeight: number,
    isFloor: boolean,
    scene: Scene,
    eyeZ: number,
    screenYCenter: number,
    projectionDistance: number,
    rayDir: Vector2D,
    cosBeta: number,
  ) {
    const observer = scene.observer;
    const relativePlaneHeight = planeHeight - eyeZ;

    for (let y = startY; y <= endY; y++) {
      const yRelative = screenYCenter - y; // Using the sheared screenYCenter maps pitch tracking natively!
      if (yRelative === 0) continue;

      const straightDistance =
        (relativePlaneHeight * projectionDistance) / yRelative;
      if (straightDistance < 0) continue;

      const distance3DWorld = straightDistance / cosBeta;
      if (distance3DWorld > observer.viewDistance) continue;

      const worldX = observer.position.x + rayDir.x * distance3DWorld;
      const worldY = observer.position.y + rayDir.y * distance3DWorld;

      let r = 0,
        g = 0,
        b = 0,
        a = 255;

      if (material.texture) {
        const tex = material.texture;
        const repeat = material.repeat || { x: 0.1, y: 0.1 };

        let texX = Math.floor(worldX * repeat.x) % tex.width;
        let texY = Math.floor(worldY * repeat.y) % tex.height;

        if (texX < 0) texX += tex.width;
        if (texY < 0) texY += tex.height;

        const colorNode = tex.pixelColumns[texX][texY];
        r = colorNode[0];
        g = colorNode[1];
        b = colorNode[2];
        a = colorNode[3];
      } else if (material.solidColor) {
        r = material.solidColor.r;
        g = material.solidColor.g;
        b = material.solidColor.b;
        a = material.solidColor.a;
      }

      // --- PER-PIXEL MULTI-LIGHT ACCUMULATION ON PLANES ---
      let litR = 0.08,
        litG = 0.08,
        litB = 0.08;

      for (const light of scene.lights) {
        const dx = light.position.x - worldX;
        const dy = light.position.y - worldY;
        const dz = light.z - planeHeight;
        const distance3DSq = dx * dx + dy * dy + dz * dz;

        if (distance3DSq >= light.radius * light.radius) continue;

        const distance3D = Math.sqrt(distance3DSq) || 1;
        const attenuation = (1.0 - distance3D / light.radius) * light.intensity;

        // Lambertian component facing flat horizontal surfaces (Surface normal vector is strictly vertical [0, 0, 1])
        const dotFactor = Math.abs(dz) / distance3D;

        const totalScalar = dotFactor * attenuation;
        litR += (light.color.r / 255) * totalScalar;
        litG += (light.color.g / 255) * totalScalar;
        litB += (light.color.b / 255) * totalScalar;
      }

      const fogFactor = distance3DWorld / observer.viewDistance;
      const visibility = Math.max(0, 1.0 - fogFactor);

      r = Math.min(255, Math.round(r * litR * visibility));
      g = Math.min(255, Math.round(g * litG * visibility));
      b = Math.min(255, Math.round(b * litB * visibility));

      this.pixelBuffer[y * this.width + column] =
        (a << 24) | (b << 16) | (g << 8) | r;
    }
  }
}
