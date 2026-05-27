import type Scene from "./scene";
import type { RADIANS, Vector2D } from "./Types";
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
    this.depthBuffer.fill(Infinity);

    const centerAngle = toRadians(observer.dirAngle);
    const halfFOV = toRadians(observer.fov / 2);

    const startAngle = centerAngle - halfFOV;
    const angleStep = toRadians(observer.fov) / this.width;
    const projectionDistance = this.width / 2 / Math.tan(halfFOV);

    // -- WALL ENVIRONMENT SWEEP PASSTHROUGH ---
    for (let column = 0; column < this.width; column++) {
      const rayAngle: RADIANS = startAngle + column * angleStep;

      const rayHit = scene.castRay(rayAngle);
      if (rayHit === null) continue;

      const beta = rayAngle - centerAngle;
      const correctedDistance = rayHit.distance * Math.cos(beta);

      this.depthBuffer[column] = correctedDistance;
      if (!observer.currentSector) continue;

      const currentSector = observer.currentSector;
      const eyeZ = observer.z + observer.height;
      const relativeCeiling = currentSector.ceilingHeight - eyeZ;
      const relativeFloor = currentSector.floorHeight - eyeZ;

      const screenYCenter = this.height / 2;

      const ceilingScreenY = Math.round(
        screenYCenter -
          (relativeCeiling / correctedDistance) * projectionDistance,
      );
      const floorScreenY = Math.round(
        screenYCenter -
          (relativeFloor / correctedDistance) * projectionDistance,
      );

      const wallTop = Math.max(0, Math.min(this.height - 1, ceilingScreenY));
      const wallBottom = Math.max(0, Math.min(this.height - 1, floorScreenY));

      const material = rayHit.boundary.material;
      const wallScreenHeight = floorScreenY - ceilingScreenY;

      const normal = this.getBoundaryNormal(
        rayHit.boundary.start,
        rayHit.boundary.end,
      );

      // --- OPTIMIZATION STEP: 2D Spatial Light Culling Pass ---
      // Filter out light resources that are too far away to impact this 2D boundary column location
      const audibleLights = [];
      for (const light of scene.lights) {
        const dx = light.position.x - rayHit.point.x;
        const dy = light.position.y - rayHit.point.y;
        const distance2DSq = dx * dx + dy * dy;

        if (distance2DSq < light.radius * light.radius) {
          audibleLights.push({ light, dx, dy, distance2DSq });
        }
      }

      // Calculate distance fog scalar once per column context
      const fogFactor = Math.max(
        0,
        Math.min(1, correctedDistance / observer.viewDistance),
      );

      // Run exactly ONE loop to paint this specific wall vertical strip
      for (let y = wallTop; y <= wallBottom; y++) {
        let baseR = 0,
          baseG = 255,
          baseB = 204,
          a = 255;

        if (material.texture) {
          const tex = material.texture;
          const repeatX = material.repeat ? material.repeat.x : 1;
          const texX = Math.floor((rayHit.u * repeatX * tex.width) % tex.width);
          const textureColumn = tex.pixelColumns[texX];

          const yOffset = y - ceilingScreenY;
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

        // --- 3D REVERSE-PROJECTION AND COUPLING PASS ---
        // Deduce the exact absolute world elevation height (Z) of this precise pixel slice
        const relativeZ =
          ((screenYCenter - y) * correctedDistance) / projectionDistance;
        const pixelWorldZ = relativeZ + eyeZ;

        // Establish uniform ambient baseline light constants (so unlit corners remain visible)
        let litR = 0.08;
        let litG = 0.08;
        let litB = 0.08;

        // Accumulate radiance vectors from all cull-approved lights
        for (const active of audibleLights) {
          const light = active.light;

          // Complete the 3D distance component vector using the pixel's height
          const dz = light.z - pixelWorldZ;
          const distance3D = Math.sqrt(active.distance2DSq + dz * dz);

          if (distance3D >= light.radius) continue;

          // Inverse linear light fall-off curve
          const attenuation =
            (1.0 - distance3D / light.radius) * light.intensity;

          // Create normalized vector components pointing directly from the wall toward the light node
          const distance2D = Math.sqrt(active.distance2DSq) || 1;
          const lightDirX = active.dx / distance2D;
          const lightDirY = active.dy / distance2D;

          // Lambertian cosine alignment against the surface face normal line
          // Math.abs ensures it maps evenly to whichever interior side of the segment is visible
          const dotFactor = Math.abs(
            normal.x * lightDirX + normal.y * lightDirY,
          );

          // Add the light color multiplied by its computed scalar intensity
          const totalScalar = dotFactor * attenuation;
          litR += (light.color.r / 255) * totalScalar;
          litG += (light.color.g / 255) * totalScalar;
          litB += (light.color.b / 255) * totalScalar;
        }

        // Apply global environmental atmosphere distance fog drop-off over the accumulated light
        const visibility = 1.0 - fogFactor;
        const r = Math.min(255, Math.round(baseR * litR * visibility));
        const g = Math.min(255, Math.round(baseG * litG * visibility));
        const b = Math.min(255, Math.round(baseB * litB * visibility));

        // Pack components cleanly into ABGR format for little-endian Uint32 operations
        const packedColor = (a << 24) | (b << 16) | (g << 8) | r;

        const bufferIndex = y * this.width + column;
        this.pixelBuffer[bufferIndex] = packedColor;
      }
    }

    this.ctx.putImageData(this.screenImageData, 0, 0);
  }
}
