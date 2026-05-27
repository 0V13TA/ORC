//#region Key Codes
export type KeyCode =
  | LetterKey
  | DigitKey
  | ModifierKey
  | NavigationKey
  | ControlKey
  | SymbolKey
  | FunctionKey
  | MediaKey;

type LetterKey =
  | "KeyA"
  | "KeyB"
  | "KeyC"
  | "KeyD"
  | "KeyE"
  | "KeyF"
  | "KeyG"
  | "KeyH"
  | "KeyI"
  | "KeyJ"
  | "KeyK"
  | "KeyL"
  | "KeyM"
  | "KeyN"
  | "KeyO"
  | "KeyP"
  | "KeyQ"
  | "KeyR"
  | "KeyS"
  | "KeyT"
  | "KeyU"
  | "KeyV"
  | "KeyW"
  | "KeyX"
  | "KeyY"
  | "KeyZ";

type DigitKey =
  | "Digit0"
  | "Digit1"
  | "Digit2"
  | "Digit3"
  | "Digit4"
  | "Digit5"
  | "Digit6"
  | "Digit7"
  | "Digit8"
  | "Digit9";

type ModifierKey =
  | "ShiftLeft"
  | "ShiftRight"
  | "ControlLeft"
  | "ControlRight"
  | "AltLeft"
  | "AltRight"
  | "MetaLeft"
  | "MetaRight";

type NavigationKey =
  | "ArrowUp"
  | "ArrowDown"
  | "ArrowLeft"
  | "ArrowRight"
  | "Home"
  | "End"
  | "PageUp"
  | "PageDown";

type ControlKey =
  | "Enter"
  | "Escape"
  | "Tab"
  | "Backspace"
  | "Delete"
  | "Space"
  | "CapsLock"
  | "NumLock"
  | "ScrollLock"
  | "Insert"
  | "PrintScreen"
  | "Pause";

type SymbolKey =
  | "Backquote"
  | "Minus"
  | "Equal"
  | "BracketLeft"
  | "BracketRight"
  | "Backslash"
  | "Semicolon"
  | "Quote"
  | "Comma"
  | "Period"
  | "Slash";

type FunctionKey =
  | "F1"
  | "F2"
  | "F3"
  | "F4"
  | "F5"
  | "F6"
  | "F7"
  | "F8"
  | "F9"
  | "F10"
  | "F11"
  | "F12"
  | "F13"
  | "F14"
  | "F15"
  | "F16"
  | "F17"
  | "F18"
  | "F19"
  | "F20"
  | "F21"
  | "F22"
  | "F23"
  | "F24";

type MediaKey =
  | "MediaTrackNext"
  | "MediaTrackPrevious"
  | "MediaStop"
  | "MediaPlayPause"
  | "MediaSelect"
  | "Eject";
//#endregion

export type DEGREES = number;
export type RADIANS = number;
export type contextType = CanvasRenderingContext2D;

export type Color = [r: number, g: number, b: number, a: number];

export interface BoxEntity {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Vector2D = {
  x: number;
  y: number;
};

export type RayHit = {
  u: number; // u part in uv co-ordinate
  point: Vector2D;
  distance: number;
  boundary: Boundary;
};

export type Boundary = {
  start: Vector2D;
  end: Vector2D;
  material: Material;

  isPortal: boolean;

  // NOTE: points to another boundary
  // to portal to, if is portal is set
  // but not portal to then it is simple
  // a division between to Sectors
  portalTo?: Boundary;
};

export type Sector = {
  floorHeight: number; // Zero is normal level
  ceilingHeight: number;

  neighbours?: Sector[];

  boundaries: Boundary[];
};

export type Texture = {
  src: string;
  width: number;
  height: number;
  pixelData: Uint8ClampedArray;
  pixelColumns: Uint8ClampedArray[][];
};

export type MaterialType = "FLOOR" | "CEILING" | "WALL";
export type Material = {
  solidColor?: string;

  tint?: string;
  texture?: Texture;

  repeat?: Vector2D; // if zero on both axis no repeat
  type: MaterialType;

  opacity?: number; //NOTE: Will be implemented later not now
};
