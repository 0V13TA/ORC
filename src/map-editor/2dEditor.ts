import { createCanvas } from "../core/utils";

const SCREEN_WIDTH = Math.round(innerWidth * 0.99);
const SCREEN_HEIGHT = Math.round(innerHeight * 0.99);
const { canvas: canvas2d, ctx: ctx2d } = createCanvas(
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
);

// --- Event Listener ---
canvas2d.addEventListener("click", (e) => {
  console.log(e.offsetX, e.offsetY);
});

canvas2d.addEventListener("mousemove", (e) => {
  console.log(e.offsetX, e.offsetY);
});

canvas2d.addEventListener("mouseup", (e) => {
  console.log(e.offsetX, e.offsetY);
});
