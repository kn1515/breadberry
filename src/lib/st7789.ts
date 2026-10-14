// M154-240240-RGB-8 mechanical drawing (Akizuki 131019), dimensions in mm.
// Match the scene's breadboard pitch: 2.54 mm = 0.24 scene units.
const mm = 0.24 / 2.54;
export const st7789Geometry = {
  mm,
  width: 32 * mm,
  depth: 43.72 * mm,
  centerZ: (43.72 / 2 - 2.5) * mm,
  activeArea: 27.72 * mm,
  // Header is at z=0; active area starts 7.11 mm from the PCB edge.
  screenZ: (7.11 + 27.72 / 2 - 2.5) * mm,
  mountingX: 13.5 * mm,
  mountingZ: 19.36 * mm,
  top: 0.94,
} as const;

export type DisplayBounds = {
  x: number;
  z: number;
  width: number;
  depth: number;
};

/** Anchor is the first header pin; reversal rotates both header and PCB. */
export function st7789Bounds(
  x: number,
  z: number,
  reversed: boolean,
): DisplayBounds {
  const direction = reversed ? -1 : 1;
  return {
    x: x + (direction * 7 * 0.24) / 2,
    z: z + direction * st7789Geometry.centerZ,
    width: st7789Geometry.width,
    depth: st7789Geometry.depth,
  };
}

// Include space for the jumper's insulation, not just its metal pin.
export const JUMPER_CLEARANCE = 0.1;
export function displayCoversPoint(
  bounds: DisplayBounds,
  x: number,
  z: number,
  clearance = JUMPER_CLEARANCE,
) {
  return (
    Math.abs(x - bounds.x) <= bounds.width / 2 + clearance &&
    Math.abs(z - bounds.z) <= bounds.depth / 2 + clearance
  );
}
