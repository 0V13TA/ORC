import ORCEngine from "./core/ORC";
import type { Boundary, Material } from "./core/Types";
import {
  loadTexture,
  Vector2,
  createColor,
  linkSectorsViaPortal,
} from "./core/utils";
import "./style.css";

const orc = new ORCEngine({
  width: Math.round(window.innerWidth * 0.95),
  height: Math.round(window.innerHeight * 0.95),
  container: document.body,
  enableMinimap: true,
  minimapSize: { width: 240, height: 240 },
});

orc.onCreate(async (scene) => {
  // 1. Asynchronously load assets with fallbacks
  const [texRed, texBlue, texPurple] = await Promise.all([
    loadTexture("/assets/redbrick.png").catch(() => null),
    loadTexture("/assets/bluestone.png").catch(() => null),
    loadTexture("/assets/purplestone.png").catch(() => null),
  ]);

  // =========================================================================
  // --- 2. DEFINE EXPANSIVE SECTORS WITH RADICAL HEIGHT VARIATIONS ---
  // =========================================================================
  // Sector A: The Great Hall (Spacious, grand base room)
  const sectorGreatHall = scene.createSector(0, 140);

  // Sector B: The Flooded Colonnade (Low roof, slightly deep layout water floor)
  const sectorColonnade = scene.createSector(-15, 80);

  // Sector C: The Elevated Guard Tower (Requires steps, tall panoramic view windows)
  const sectorTower = scene.createSector(35, 180);

  // Sector D: The Shadow Corridor (Narrow connecting passage, highly claustrophobic)
  const sectorCorridor = scene.createSector(0, 75);

  // Sector E: The Lava Boiler Sacristy (Sunken fire pit deep in the facility)
  const sectorBoiler = scene.createSector(-40, 110);

  // =========================================================================
  // --- 3. CONFIGURING MATERIALS ---
  // =========================================================================
  const matGreatHall: Material = texRed
    ? { type: "WALL", texture: texRed }
    : { type: "WALL", solidColor: createColor(160, 50, 50) };

  const matColonnade: Material = texBlue
    ? { type: "WALL", texture: texBlue }
    : { type: "WALL", solidColor: createColor(45, 90, 160) };

  const matTower: Material = texRed
    ? { type: "WALL", texture: texRed }
    : { type: "WALL", solidColor: createColor(210, 180, 140) };

  const matCorridor: Material = texPurple
    ? { type: "WALL", texture: texPurple }
    : { type: "WALL", solidColor: createColor(70, 40, 90) };

  const matBoiler: Material = texPurple
    ? { type: "WALL", texture: texPurple }
    : { type: "WALL", solidColor: createColor(220, 100, 30) };

  const matPortal: Material = {
    type: "WALL",
    solidColor: createColor(0, 255, 204, 100),
  };

  // Helper macro to draw standard solid geometric boundaries rapidly
  const buildWall = (
    sector: any,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    mat: Material,
  ) => {
    const bound: Boundary = {
      start: Vector2.createVector(x1, y1),
      end: Vector2.createVector(x2, y2),
      material: mat,
      isPortal: false,
    };
    scene.addBoundary(sector, bound);
  };

  // =========================================================================
  // --- LAYOUT DESIGN: GEOMETRIC MAP BLOCK ARCHITECTURE ---
  // =========================================================================

  // --- SECTOR A: THE GREAT HALL (Bounds: X: 0 to 300, Y: 0 to 300)
  buildWall(sectorGreatHall, 0, 0, 300, 0, matGreatHall); // Top Outer Wall
  buildWall(sectorGreatHall, 0, 300, 0, 0, matGreatHall); // Left Outer Wall
  buildWall(sectorGreatHall, 300, 0, 300, 100, matGreatHall); // Right Outer Upper Wall
  // (Portal Gap leaves exit here from Y: 100 to 160 leading to Tower)
  buildWall(sectorGreatHall, 300, 160, 300, 300, matGreatHall); // Right Outer Lower Wall
  buildWall(sectorGreatHall, 300, 300, 160, 300, matGreatHall); // Bottom Outer Right Wall
  // (Portal Gap leaves exit here from X: 100 to 160 leading to Colonnade)
  buildWall(sectorGreatHall, 100, 300, 0, 300, matGreatHall); // Bottom Outer Left Wall

  // Architectural Center Pillars inside Great Hall to block visibility lines
  buildWall(sectorGreatHall, 120, 120, 160, 120, matGreatHall);
  buildWall(sectorGreatHall, 160, 120, 160, 160, matGreatHall);
  buildWall(sectorGreatHall, 160, 160, 120, 160, matGreatHall);
  buildWall(sectorGreatHall, 120, 160, 120, 120, matGreatHall);

  // --- SECTOR B: THE FLOODED COLONNADE (South exit of Great Hall, Bounds: X: 80 to 220, Y: 300 to 550)
  buildWall(sectorColonnade, 80, 300, 100, 300, matColonnade); // Left entry hook block
  buildWall(sectorColonnade, 160, 300, 220, 300, matColonnade); // Right entry hook block
  buildWall(sectorColonnade, 80, 300, 80, 550, matColonnade); // Left Boundary Wall
  buildWall(sectorColonnade, 220, 550, 220, 300, matColonnade); // Right Boundary Wall
  buildWall(sectorColonnade, 220, 550, 170, 550, matColonnade); // Bottom Right Wall
  // (Portal Gap leaves exit here from X: 130 to 170 leading to Corridor)
  buildWall(sectorColonnade, 130, 550, 80, 550, matColonnade); // Bottom Left Wall

  // Freestanding pillars inside water room to catch light bounces nicely
  const buildPillar = (
    sec: any,
    cx: number,
    cy: number,
    size: number,
    mat: Material,
  ) => {
    buildWall(sec, cx - size, cy - size, cx + size, cy - size, mat);
    buildWall(sec, cx + size, cy - size, cx + size, cy + size, mat);
    buildWall(sec, cx + size, cy + size, cx - size, cy + size, mat);
    buildWall(sec, cx - size, cy + size, cx - size, cy - size, mat);
  };
  buildPillar(sectorColonnade, 120, 420, 10, matColonnade);
  buildPillar(sectorColonnade, 180, 420, 10, matColonnade);

  // --- SECTOR C: THE ELEVATED GUARD TOWER (East exit of Great Hall, Bounds: X: 300 to 500, Y: 60 to 200)
  buildWall(sectorTower, 300, 60, 500, 60, matTower); // Top Wall
  buildWall(sectorTower, 500, 60, 500, 200, matTower); // Right Outer Wall
  buildWall(sectorTower, 500, 200, 300, 200, matTower); // Bottom Wall
  buildWall(sectorTower, 300, 200, 300, 160, matTower); // Lower Left Link Wall
  buildWall(sectorTower, 300, 100, 300, 60, matTower); // Upper Left Link Wall

  // --- SECTOR D: THE SHADOW CORRIDOR (South exit of Colonnade, Bounds: X: 130 to 170, Y: 550 to 800)
  buildWall(sectorCorridor, 130, 550, 130, 800, matCorridor); // Left Wall
  buildWall(sectorCorridor, 170, 800, 170, 550, matCorridor); // Right Wall
  // (Portal Gap leaves exit at the bottom edge Y: 800 from X: 130 to 170 leading to Boiler pit)

  // --- SECTOR E: THE LAVA BOILER SACRISTY (Deep sunken chamber at South terminus, Bounds: X: 50 to 250, Y: 800 to 1050)
  buildWall(sectorBoiler, 130, 800, 50, 800, matBoiler); // Top Left boundary wall
  buildWall(sectorBoiler, 250, 800, 170, 800, matBoiler); // Top Right boundary wall
  buildWall(sectorBoiler, 50, 800, 50, 1050, matBoiler); // Far Left Flank
  buildWall(sectorBoiler, 50, 1050, 250, 1050, matBoiler); // Far Bottom Backwall
  buildWall(sectorBoiler, 250, 1050, 250, 800, matBoiler); // Far Right Flank

  // =========================================================================
  // --- 4. STITCH ROOMS TOGETHER VIA PORTALS ---
  // =========================================================================
  // Gate 1: Great Hall <-> Flooded Colonnade
  linkSectorsViaPortal(
    sectorGreatHall,
    sectorColonnade,
    Vector2.createVector(100, 300),
    Vector2.createVector(160, 300),
    matPortal,
  );

  // Gate 2: Great Hall <-> Elevated Guard Tower
  linkSectorsViaPortal(
    sectorGreatHall,
    sectorTower,
    Vector2.createVector(300, 100),
    Vector2.createVector(300, 160),
    matPortal,
  );

  // Gate 3: Flooded Colonnade <-> Shadow Corridor
  linkSectorsViaPortal(
    sectorColonnade,
    sectorCorridor,
    Vector2.createVector(130, 550),
    Vector2.createVector(170, 550),
    matPortal,
  );

  // Gate 4: Shadow Corridor <-> Lava Boiler Pit
  linkSectorsViaPortal(
    sectorCorridor,
    sectorBoiler,
    Vector2.createVector(130, 800),
    Vector2.createVector(170, 800),
    matPortal,
  );

  // =========================================================================
  // --- 5. ACCUMULATE POINT LIGHT SOURCES (DYNAMIC RANGE LIGHTING) ---
  // =========================================================================
  // Light 1: Eerie green luminescent torch floating high up inside the center pillar of Great Hall
  scene.addLight({
    id: "hub_center_torch",
    position: Vector2.createVector(140, 180),
    z: 70, // Hanging midpoint vertically
    radius: 120,
    intensity: 1.5,
    color: { r: 0, g: 255, b: 180 },
  });

  // Light 2: Cold ambient blue essence light illuminating the Flooded Colonnade pools
  scene.addLight({
    id: "water_pit_glow",
    position: Vector2.createVector(150, 420),
    z: -10, // Close to the flooded floor
    radius: 160,
    intensity: 2.0,
    color: { r: 50, g: 120, b: 255 },
  });

  // Light 3: Intense, blazing orange fire light filling the sunken lava sacristy depths
  scene.addLight({
    id: "sacristy_fire_pit",
    position: Vector2.createVector(150, 950),
    z: -35, // Low down inside the volcanic basin
    radius: 200,
    intensity: 2.5,
    color: { r: 255, g: 85, b: 0 },
  });

  // Light 4: Crisp white spotlight inside the high observation tower
  scene.addLight({
    id: "tower_spot",
    position: Vector2.createVector(400, 130),
    z: 100, // Elevated high in space matching sector configuration elevations
    radius: 140,
    intensity: 1.8,
    color: { r: 255, g: 255, b: 240 },
  });

  // 6. Spawn tracking configurations directly inside the Great Hall safety zones
  scene.observer.position = Vector2.createVector(60, 60);
  scene.observer.lookAt(45); // Face southeast looking towards the central architecture pillars and exits
});

orc.onUpdate((_dt, input) => {
  if (input.isPressed("KeyM")) {
    const isVisible = orc.mapCanvas.style.display !== "none";
    orc.setMinimapVisible(!isVisible);
  }
});

orc.start();
