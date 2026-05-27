// src/main.ts
import ORCEngine from "./ORC";
import "./style.css"; // Ensures canvas absolute scaling rules wrap nicely

// Bootstrap ORC Engine core instances
const orc = new ORCEngine({
  width: innerWidth * 0.99,
  height: innerHeight * 0.99,

  container: document.body,

  enableMinimap: true,
  minimapSize: { width: 200, height: 200 },
});

// Kick off the master processing request loop!
orc.start();

// // Custom gameplay or tracking behaviors can hook in effortlessly:
// orc.onUpdate((dt) => {
//   // Developer can monitor game state ticks here without modifying core engine source files
// });

console.log("ORC Engine active and processing coordinates:", orc);
