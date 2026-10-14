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
} as const;
