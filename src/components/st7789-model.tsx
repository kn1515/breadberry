"use client";

import { useMemo } from "react";
import { Html } from "@react-three/drei";
import { Path, Shape } from "three";
import { catalog } from "@/lib/circuit";
import { st7789Geometry as g } from "@/lib/st7789";

/** Flat module with an illustrative fitted header. No simulated display output. */
export default function St7789Model({ labels = true }: { labels?: boolean }) {
  const pcb = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(-g.width / 2, -g.depth / 2);
    shape.lineTo(g.width / 2, -g.depth / 2);
    shape.lineTo(g.width / 2, g.depth / 2);
    shape.lineTo(-g.width / 2, g.depth / 2);
    shape.closePath();
    for (const x of [-g.mountingX, g.mountingX])
      for (const y of [-g.mountingZ, g.mountingZ]) {
        const hole = new Path();
        hole.absarc(x, y, g.mm, 0, Math.PI * 2, true);
        shape.holes.push(hole);
      }
    return shape;
  }, []);
  return (
    <group>
      <mesh
        position={[0, 0.65, g.centerZ]}
        rotation={[-Math.PI / 2, 0, 0]}
        castShadow
      >
        <extrudeGeometry
          args={[
            pcb,
            { depth: 1.2 * g.mm, bevelEnabled: false, curveSegments: 16 },
          ]}
        />
        <meshStandardMaterial color={catalog.st7789.color} roughness={0.6} />
      </mesh>
      {/* Four plated mounting holes: 2 mm bore, 3.5 mm pad. */}
      {[-g.mountingX, g.mountingX].flatMap((x) =>
        [-g.mountingZ, g.mountingZ].map((z) => (
          <mesh
            key={`${x}:${z}`}
            position={[x, 0.765, g.centerZ + z]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <ringGeometry args={[g.mm, 1.75 * g.mm, 24]} />
            <meshStandardMaterial
              color="#d7b96b"
              metalness={0.75}
              roughness={0.35}
            />
          </mesh>
        )),
      )}
      <mesh position={[0, 0.54, 0]} castShadow>
        <boxGeometry args={[8 * 0.24, 0.22, 0.24]} />
        <meshStandardMaterial color="#171b22" />
      </mesh>
      {catalog.st7789.pins.map((pin, index) => (
        <group key={pin} position={[(index - 3.5) * 0.24, 0, 0]}>
          <mesh position={[0, 0.765, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.035, 0.085, 16]} />
            <meshStandardMaterial color="#d7b96b" metalness={0.7} />
          </mesh>
          <mesh position={[0, 0.73, 0]}>
            <boxGeometry args={[0.055, 0.18, 0.055]} />
            <meshStandardMaterial
              color="#d0d5da"
              metalness={0.8}
              roughness={0.25}
            />
          </mesh>
          {labels && (
            <Html
              position={[0, 0.79, 0.23]}
              center
              style={{ pointerEvents: "none", fontSize: 7, color: "white" }}
            >
              {pin}
            </Html>
          )}
        </group>
      ))}
      {/* Panel outline and 27.72 mm square active area from the drawing. */}
      <mesh position={[0, 0.84, (5 + 33.72 / 2 - 2.5) * g.mm]} castShadow>
        <boxGeometry args={[31.52 * g.mm, 0.15, 33.72 * g.mm]} />
        <meshStandardMaterial color="#1b1e24" roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.922, g.screenZ]}>
        <boxGeometry args={[g.activeArea, 0.014, g.activeArea]} />
        <meshStandardMaterial
          color="#080e18"
          metalness={0.25}
          roughness={0.2}
        />
      </mesh>
      {/* Simplified flex tail; small component details are illustrative. */}
      <mesh position={[0, 0.78, 37.7 * g.mm]}>
        <boxGeometry args={[11.3 * g.mm, 0.025, 2.2 * g.mm]} />
        <meshStandardMaterial color="#b87526" metalness={0.4} roughness={0.5} />
      </mesh>
    </group>
  );
}
