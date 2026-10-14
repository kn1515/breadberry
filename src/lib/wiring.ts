import {
  CatmullRomCurve3,
  CubicBezierCurve3,
  CurvePath,
  LineCurve3,
  Vector3,
} from "three";
import type { Point } from "./circuit";
import { st7789Geometry, type DisplayBounds } from "./st7789";

export const WIRE_RADIUS = 0.033;
export const DISPLAY_WIRE_SEGMENTS = 64;

export function createWireCurve(
  start: Point,
  end: Point,
  index: number,
  displays: readonly DisplayBounds[] = [],
) {
  const lane = index % 12;
  if (!displays.length) {
    return new CatmullRomCurve3([
      new Vector3(...start),
      new Vector3(start[0], 0.75 + lane * 0.045, start[2]),
      new Vector3(
        (start[0] + end[0]) / 2,
        1.15 + lane * 0.06,
        (start[2] + end[2]) / 2,
      ),
      new Vector3(end[0], 0.8 + lane * 0.045, end[2]),
      new Vector3(...end),
    ]);
  }

  // Rise vertically from exposed holes before crossing the PCB. Bézier control
  // points keep the entire crossing above the panel, including the insulation.
  // Unlike a Catmull-Rom spline, this cannot overshoot into the body near a hole.
  const height = st7789Geometry.top + WIRE_RADIUS + 0.16 + lane * 0.045;
  const liftStart = new Vector3(start[0], height, start[2]);
  const liftEnd = new Vector3(end[0], height, end[2]);
  const curve = new CurvePath<Vector3>();
  curve.add(new LineCurve3(new Vector3(...start), liftStart));
  curve.add(
    new CubicBezierCurve3(
      liftStart,
      new Vector3(start[0], height + 0.4, start[2]),
      new Vector3(end[0], height + 0.4, end[2]),
      liftEnd,
    ),
  );
  curve.add(new LineCurve3(liftEnd, new Vector3(...end)));
  return curve;
}
