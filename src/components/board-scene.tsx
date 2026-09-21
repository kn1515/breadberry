"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html, ContactShadows } from "@react-three/drei";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  Component,
  type ReactNode,
} from "react";
import * as THREE from "three";
import {
  boards,
  resistorBands,
  catalog,
  isI2c,
  compileCircuit,
  holePosition,
  layoutHolePosition,
  boardPinPosition,
  type Circuit,
  type Point,
} from "@/lib/circuit";

function Label({
  at,
  children,
  color = "#b0bdce",
}: {
  at: Point;
  children: ReactNode;
  color?: string;
}) {
  return (
    <Html
      position={at}
      center
      style={{
        pointerEvents: "none",
        color,
        fontSize: 9,
        whiteSpace: "nowrap",
        fontFamily: "Inter, sans-serif",
      }}
    >
      {children}
    </Html>
  );
}
function Holes() {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const matrix = new THREE.Object3D();
    let index = 0;
    for (let r = 1; r <= 30; r++)
      for (const col of "abcdefghij") {
        matrix.position.set(...holePosition(`${col}${r}`));
        matrix.updateMatrix();
        ref.current!.setMatrixAt(index++, matrix.matrix);
      }
    for (let r = 1; r <= 30; r++)
      for (const z of [-1.95, -1.65, 1.65, 1.95]) {
        matrix.position.set((r - 15.5) * 0.24, 0.18, z);
        matrix.updateMatrix();
        ref.current!.setMatrixAt(index++, matrix.matrix);
      }
    ref.current!.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, 420]}>
      <boxGeometry args={[0.085, 0.02, 0.085]} />
      <meshStandardMaterial color="#46546a" roughness={0.9} />
    </instancedMesh>
  );
}
function Breadboard() {
  return (
    <group>
      <mesh receiveShadow position={[0, 0, 0]}>
        <boxGeometry args={[8.15, 0.32, 4.7]} />
        <meshStandardMaterial color="#dbe2ea" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.167, 0]}>
        <boxGeometry args={[7.4, 0.016, 0.2]} />
        <meshStandardMaterial color="#73869b" />
      </mesh>
      {[-2.12, -1.48, 1.48, 2.12].map((z, i) => (
        <mesh key={z} position={[0, 0.172, z]}>
          <boxGeometry args={[7.35, 0.008, 0.018]} />
          <meshBasicMaterial color={i % 2 ? "#4584bb" : "#e87581"} />
        </mesh>
      ))}
      <Holes />
      {[1, 5, 10, 15, 20, 25, 30].map((row) => (
        <Label
          key={row}
          at={[(row - 15.5) * 0.24, 0.19, -1.39]}
          color="#516178"
        >
          {row}
        </Label>
      ))}
      {"abcdefghij".split("").map((c) => (
        <Label
          key={c}
          at={[-3.9, 0.2, holePosition(`${c}1`)[2]]}
          color="#526278"
        >
          {c}
        </Label>
      ))}
      <Label at={[3.8, 0.2, 1.82]} color="#c34c61">
        +
      </Label>
      <Label at={[3.8, 0.2, -1.68]} color="#35638e">
        −
      </Label>
    </group>
  );
}
function Controller({ circuit }: { circuit: Circuit }) {
  const board = circuit.board;
  const pico = board === "pico";
  const pi = board === "raspberry-pi";
  return (
    <group>
      <mesh castShadow position={[0, 0.13, -3.85]}>
        <boxGeometry
          args={[pi ? 5.25 : pico ? 4.4 : 3.85, 0.18, pi ? 2.2 : 1.65]}
        />
        <meshStandardMaterial
          color={board === "esp32" ? "#172d37" : "#136b51"}
          metalness={0.35}
          roughness={0.5}
        />
      </mesh>
      <mesh castShadow position={[0, 0.3, -3.85]}>
        <boxGeometry args={[board === "esp32" ? 1.5 : 0.75, 0.2, 1]} />
        <meshStandardMaterial
          color={board === "esp32" ? "#9daab8" : "#202938"}
          metalness={0.7}
          roughness={0.4}
        />
      </mesh>
      <mesh position={[-(pi ? 2.5 : pico ? 2.1 : 1.9), 0.29, -3.85]}>
        <boxGeometry args={[0.35, 0.28, 0.65]} />
        <meshStandardMaterial
          color="#bdc6d2"
          metalness={0.9}
          roughness={0.25}
        />
      </mesh>
      {Object.keys(boards[board].pins).map((pin) => (
        <group key={pin}>
          <mesh position={boardPinPosition(board, pin)}>
            <boxGeometry args={[0.095, 0.21, 0.095]} />
            <meshStandardMaterial
              color="#dbc78c"
              metalness={0.8}
              roughness={0.3}
            />
          </mesh>
          {circuit.wires.some((w) =>
            [w.from, w.to].includes(`board.${pin}`),
          ) && (
            <Label
              at={[
                boardPinPosition(board, pin)[0],
                0.38,
                boardPinPosition(board, pin)[2] + 0.14,
              ]}
              color="#cee3df"
            >
              {pin.replace("GPIO", "").replace("GP", "")}
            </Label>
          )}
        </group>
      ))}
      <Label at={[0, 0.43, -4.18]} color="#f3f7ff">
        {board === "esp32" ? "ESP32" : pico ? "PICO · RP2040" : "RASPBERRY PI"}
      </Label>
      <mesh position={[1.2, 0.27, -4.1]}>
        <sphereGeometry args={[0.045, 8, 8]} />
        <meshStandardMaterial
          color="#34d399"
          emissive="#34d399"
          emissiveIntensity={2}
        />
      </mesh>
    </group>
  );
}
function Segment({
  a,
  b,
  color = "#b7c6d8",
  radius = 0.018,
}: {
  a: Point;
  b: Point;
  color?: string;
  radius?: number;
}) {
  const { mid, quaternion, length } = useMemo(() => {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b);
    const diff = end.clone().sub(start);
    return {
      mid: start.add(end).multiplyScalar(0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        diff.clone().normalize(),
      ),
      length: diff.length(),
    };
  }, [a, b]);
  return (
    <mesh position={mid} quaternion={quaternion} castShadow>
      <cylinderGeometry args={[radius, radius, length, 8]} />
      <meshStandardMaterial color={color} metalness={0.5} roughness={0.4} />
    </mesh>
  );
}
function Part({
  part,
  holes,
  active,
}: {
  part: Circuit["parts"][number];
  holes: Record<string, string>;
  active: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const progress = useRef(0);
  useEffect(() => {
    progress.current = active ? 0 : 1;
  }, [active]);
  useFrame((_, delta) => {
    progress.current = Math.min(1, progress.current + delta * 1.6);
    if (group.current)
      group.current.position.y = active
        ? Math.pow(1 - progress.current, 3) * 2
        : 0;
  });
  const def = catalog[part.kind];
  const pins = def.pins.map((p) =>
    layoutHolePosition(holes[`${part.id}.${p}`]),
  );
  const x = (pins[0][0] + pins[pins.length - 1][0]) / 2,
    z = pins[0][2];
  return (
    <group ref={group}>
      {pins.map((p, i) => (
        <Segment key={i} a={p} b={[p[0], 0.65, p[2]]} />
      ))}
      {part.kind === "resistor" ? (
        <>
          <Segment a={[pins[0][0], 0.65, z]} b={[pins[1][0], 0.65, z]} />
          <mesh
            rotation={[0, 0, Math.PI / 2]}
            position={[x, 0.65, z]}
            castShadow
          >
            <cylinderGeometry args={[0.115, 0.115, 0.5, 16]} />
            <meshStandardMaterial color="#dfbd8c" />
          </mesh>
          {[-0.14, -0.06, 0.04, 0.17].map((offset, i) => (
            <mesh
              key={i}
              rotation={[0, 0, Math.PI / 2]}
              position={[x + offset, 0.65, z]}
            >
              <cylinderGeometry args={[0.119, 0.119, 0.035, 16]} />
              <meshStandardMaterial color={resistorBands(part.value)[i]} />
            </mesh>
          ))}
        </>
      ) : part.kind === "led" ? (
        <>
          <mesh position={[x, 0.74, z]} castShadow>
            <capsuleGeometry args={[0.16, 0.15, 6, 16]} />
            <meshStandardMaterial
              color="#34d399"
              emissive="#10b981"
              emissiveIntensity={0.4}
              transparent
              opacity={0.87}
              roughness={0.25}
            />
          </mesh>
          <mesh position={[x, 0.55, z]}>
            <cylinderGeometry args={[0.2, 0.2, 0.055, 16]} />
            <meshStandardMaterial color="#1d9d77" />
          </mesh>
        </>
      ) : isI2c(part.kind) ? (
        <>
          <mesh position={[x, 0.71, z]} castShadow>
            <boxGeometry args={[1.02, 0.12, 0.72]} />
            <meshStandardMaterial color={def.color} />
          </mesh>
          <mesh position={[x, 0.81, z]}>
            <boxGeometry
              args={[
                part.kind === "ssd1306" ? 0.86 : 0.28,
                0.08,
                part.kind === "ssd1306" ? 0.54 : 0.28,
              ]}
            />
            <meshStandardMaterial
              color={part.kind === "ssd1306" ? "#08131f" : "#a7b4b9"}
              metalness={0.5}
              roughness={0.35}
            />
          </mesh>
          {part.kind === "ssd1306" && (
            <Label at={[x, 0.89, z]} color="#67e8f9">
              OLED · 128×64
            </Label>
          )}
        </>
      ) : part.kind === "potentiometer" ? (
        <>
          <mesh position={[x, 0.76, z]} castShadow>
            <boxGeometry args={[0.65, 0.25, 0.5]} />
            <meshStandardMaterial color={def.color} />
          </mesh>
          <mesh position={[x, 1.0, z]}>
            <cylinderGeometry args={[0.14, 0.14, 0.25, 16]} />
            <meshStandardMaterial color="#c6cfda" metalness={0.6} />
          </mesh>
        </>
      ) : part.kind === "reed" ? (
        <>
          <Segment a={[pins[0][0], 0.65, z]} b={[pins[1][0], 0.65, z]} />
          <mesh
            position={[x, 0.65, z]}
            rotation={[0, 0, Math.PI / 2]}
            castShadow
          >
            <cylinderGeometry args={[0.11, 0.11, 0.6, 16]} />
            <meshStandardMaterial color={def.color} transparent opacity={0.5} />
          </mesh>
        </>
      ) : part.kind === "ntc" || part.kind === "ldr" ? (
        <mesh position={[x, 0.79, z]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.22, 0.22, 0.13, 20]} />
          <meshStandardMaterial color={def.color} />
        </mesh>
      ) : part.kind === "ds18b20" || part.kind === "tilt" ? (
        <mesh position={[x, 0.86, z]} castShadow>
          <cylinderGeometry
            args={[0.24, 0.24, 0.43, part.kind === "ds18b20" ? 5 : 16]}
          />
          <meshStandardMaterial color={def.color} />
        </mesh>
      ) : (
        <>
          <mesh position={[x, 0.88, z]} castShadow>
            <boxGeometry
              args={[part.kind === "dht22" ? 0.85 : 0.62, 0.57, 0.43]}
            />
            <meshStandardMaterial color={def.color} />
          </mesh>
          {part.kind === "dht22" &&
            Array.from({ length: 5 }, (_, i) => (
              <mesh key={i} position={[x, 0.69 + i * 0.075, z + 0.22]}>
                <boxGeometry args={[0.63, 0.035, 0.013]} />
                <meshStandardMaterial color="#8d9ba9" />
              </mesh>
            ))}
          {part.kind === "button" && (
            <mesh position={[x, 1.2, z]}>
              <cylinderGeometry args={[0.17, 0.17, 0.14, 12]} />
              <meshStandardMaterial color="#24283b" />
            </mesh>
          )}
        </>
      )}
      <Label at={[x, 1.45, z]} color={active ? "#a5b4fc" : "#d6e3ef"}>
        {part.id} ·{" "}
        {part.kind === "resistor" ? part.value : def.name.split(" ")[0]}
      </Label>
    </group>
  );
}
function AnimatedWire({
  start,
  end,
  color,
  active,
  index,
}: {
  start: Point;
  end: Point;
  color: string;
  active: boolean;
  index: number;
}) {
  const progress = useRef(active ? 0 : 1);
  const mesh = useRef<THREE.Mesh>(null);
  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(...start),
        new THREE.Vector3(start[0], 0.75 + index * 0.045, start[2]),
        new THREE.Vector3(
          (start[0] + end[0]) / 2,
          1.15 + index * 0.06,
          (start[2] + end[2]) / 2,
        ),
        new THREE.Vector3(end[0], 0.8 + index * 0.045, end[2]),
        new THREE.Vector3(...end),
      ]),
    [start, end, index],
  );
  useEffect(() => {
    progress.current = active ? 0 : 1;
  }, [active]);
  useFrame((_, delta) => {
    progress.current = Math.min(1, progress.current + delta * 0.9);
    mesh.current?.geometry.setDrawRange(
      0,
      Math.floor((64 * 8 * 6 * progress.current) / 6) * 6,
    );
  });
  return (
    <mesh ref={mesh} castShadow>
      <tubeGeometry args={[curve, 64, 0.033, 8, false]} />
      <meshStandardMaterial
        color={color}
        roughness={0.36}
        metalness={0.2}
        emissive={color}
        emissiveIntensity={active ? 0.22 : 0}
      />
    </mesh>
  );
}
class SceneBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="scene-fallback">
        3D表示を開始できませんでした。「回路図」タブで接続を確認できます。
      </div>
    ) : (
      this.props.children
    );
  }
}
export default function BoardScene({
  circuit,
  step,
  view,
  reset,
}: {
  circuit: Circuit;
  step: number;
  view: "perspective" | "top";
  reset: number;
}) {
  const compiled = useMemo(() => compileCircuit(circuit), [circuit]);
  const [supported, setSupported] = useState(true);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) setSupported(false);
    else gl.getExtension("WEBGL_lose_context")?.loseContext();
  }, []);
  if (!supported)
    return (
      <div className="scene-fallback">
        WebGLを利用できません。「回路図」タブで接続を確認できます。
      </div>
    );
  return (
    <SceneBoundary>
      <Canvas
        key={`${view}-${reset}`}
        shadows
        camera={{
          position: view === "top" ? [0, 15, -0.2] : [7.8, 10.2, 9.8],
          fov: 39,
        }}
        dpr={[1, 1.6]}
        gl={{ antialias: true, alpha: true }}
        aria-label="ブレッドボードの3D配線モデル"
      >
        <ambientLight intensity={1.2} />
        <hemisphereLight args={["#cfddff", "#273447", 1.5]} />
        <directionalLight
          position={[3, 8, 4]}
          intensity={2.3}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <pointLight position={[-4, 4, -4]} color="#818cf8" intensity={16} />
        <group position={[0, 0, 1]}>
          <Breadboard />
          <Controller circuit={circuit} />
          {circuit.parts.map(
            (p, i) =>
              i < step && (
                <Part
                  key={p.id}
                  part={p}
                  holes={compiled.pinHoles}
                  active={i === step - 1 && !reduced}
                />
              ),
          )}
          {step > circuit.parts.length &&
            compiled.wires[step - circuit.parts.length - 1] &&
            [
              compiled.wires[step - circuit.parts.length - 1].start.position,
              compiled.wires[step - circuit.parts.length - 1].end.position,
            ].map((position, i) => (
              <mesh
                key={`target-${i}`}
                position={[position[0], position[1] + 0.04, position[2]]}
                rotation={[-Math.PI / 2, 0, 0]}
              >
                <ringGeometry args={[0.1, 0.145, 24]} />
                <meshBasicMaterial color="#c4b5fd" side={THREE.DoubleSide} />
              </mesh>
            ))}
          {compiled.wires.map(
            (w, i) =>
              i + circuit.parts.length < step && (
                <AnimatedWire
                  key={w.id}
                  start={w.start.position}
                  end={w.end.position}
                  color={w.color}
                  active={i + circuit.parts.length === step - 1 && !reduced}
                  index={i}
                />
              ),
          )}
        </group>
        <ContactShadows
          position={[0, -0.19, 0]}
          opacity={0.45}
          scale={20}
          blur={2.5}
          far={8}
        />
        <gridHelper
          args={[36, 72, "#263a50", "#1b2a3e"]}
          position={[0, -0.23, 0]}
        />
        <OrbitControls
          makeDefault
          target={[0, 0.3, -0.6]}
          enablePan
          minDistance={6}
          maxDistance={24}
          maxPolarAngle={Math.PI / 2.1}
        />
      </Canvas>
    </SceneBoundary>
  );
}
