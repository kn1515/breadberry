"use client";
import { usePreferences, Text } from "./preferences";
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
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
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { movePart, nearestLayoutHole, partBounds } from "@/lib/layout";
import { resolveLedColor } from "@/lib/led";
import LedModel from "./led-model";
import {
  boards,
  resistorBands,
  catalog,
  isI2c,
  compileCircuit,
  holePosition,
  layoutHolePosition,
  placementFor,
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
export function Part({
  part,
  holes,
  active,
  labels = true,
}: {
  part: Circuit["parts"][number];
  holes: Record<string, string>;
  active: boolean;
  labels?: boolean;
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
        <group position={[x, 0.55, z]}>
          <LedModel color={resolveLedColor(part)} />
        </group>
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
          {labels && part.kind === "ssd1306" && (
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
      {labels && (
        <Label
          at={[x, 1.45, z]}
          color={active ? "var(--accent)" : "var(--scene-label)"}
        >
          <span data-part-label={part.id}>
            {part.id} ·{" "}
            {part.kind === "resistor" ? part.value : def.name.split(" ")[0]}
          </span>
        </Label>
      )}
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
type SceneEditor = {
  selected: string;
  onSelect: (id: string) => void;
  onMove: (id: string, hole: string) => void;
  disabled: boolean;
  invalidParts: string[];
};

function SceneWorkspace({
  circuit,
  step,
  reduced,
  view,
  reset,
  editor,
}: {
  circuit: Circuit;
  step: number;
  reduced: boolean;
  view: "perspective" | "top";
  reset: number;
  editor?: SceneEditor;
}) {
  const { camera, gl } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  const latest = useRef({ circuit, editor });
  latest.current = { circuit, editor };
  const drag = useRef<{
    id: string;
    pointerId: number;
    x: number;
    y: number;
    offset: THREE.Vector3;
    moved: boolean;
  } | null>(null);
  const [preview, setPreview] = useState<{ id: string; hole: string } | null>(
    null,
  );
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const position: [number, number, number] =
      view === "top" ? [0, 15, -0.2] : [7.8, 10.2, 9.8];
    controls.current?.target.set(0, 0.3, -0.6);
    camera.position.set(...position);
    camera.lookAt(0, 0.3, -0.6);
    camera.updateProjectionMatrix();
    controls.current?.update();
  }, [camera, reset, view]);
  const displayed = useMemo(
    () => (preview ? movePart(circuit, preview.id, preview.hole) : circuit),
    [circuit, preview],
  );
  const compiled = useMemo(() => compileCircuit(displayed), [displayed]);

  useEffect(() => {
    const canvas = gl.domElement;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.18);
    const raycaster = new THREE.Raycaster();
    function holeAt(event: PointerEvent) {
      const state = drag.current;
      if (!state) return null;
      const rect = canvas.getBoundingClientRect();
      // Reject an off-canvas drop rather than moving to an invisible location.
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      )
        return null;
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          (-(event.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      const point = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
      if (!point) return null;
      point.sub(state.offset);
      return nearestLayoutHole(point.x, point.z - 1);
    }
    function finish() {
      const state = drag.current;
      drag.current = null;
      if (state && canvas.hasPointerCapture(state.pointerId))
        canvas.releasePointerCapture(state.pointerId);
      if (controls.current) controls.current.enabled = true;
      canvas.style.cursor = "auto";
      setPreview(null);
      setDragging(false);
    }
    function move(event: PointerEvent) {
      const state = drag.current;
      if (!state || event.pointerId !== state.pointerId) return;
      if (Math.hypot(event.clientX - state.x, event.clientY - state.y) > 4)
        state.moved = true;
      if (!state.moved) return;
      if (event.cancelable) event.preventDefault();
      const hole = holeAt(event);
      canvas.style.cursor = hole ? "grabbing" : "not-allowed";
      setPreview((current) =>
        hole
          ? current?.id === state.id && current.hole === hole
            ? current
            : { id: state.id, hole }
          : null,
      );
    }
    function up(event: PointerEvent) {
      const state = drag.current;
      if (!state || event.pointerId !== state.pointerId) return;
      const hole = state.moved ? holeAt(event) : null;
      const { circuit: current, editor: currentEditor } = latest.current;
      const index = current.parts.findIndex((p) => p.id === state.id);
      finish();
      if (
        hole &&
        index >= 0 &&
        !currentEditor?.disabled &&
        hole !== placementFor(current.parts[index], index).hole
      )
        currentEditor?.onMove(state.id, hole);
    }
    function cancel(event: PointerEvent) {
      if (event.pointerId === drag.current?.pointerId) finish();
    }
    function key(event: KeyboardEvent) {
      if (event.key === "Escape" && drag.current) {
        event.preventDefault();
        finish();
      }
    }
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    canvas.addEventListener("lostpointercapture", cancel);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", finish);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("lostpointercapture", cancel);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", finish);
      const state = drag.current;
      drag.current = null;
      if (state && canvas.hasPointerCapture(state.pointerId))
        canvas.releasePointerCapture(state.pointerId);
      if (controls.current) controls.current.enabled = true;
      canvas.style.cursor = "auto";
    };
  }, [camera, gl]);

  useEffect(() => {
    if (editor?.disabled) {
      const state = drag.current;
      drag.current = null;
      if (state && gl.domElement.hasPointerCapture(state.pointerId))
        gl.domElement.releasePointerCapture(state.pointerId);
      gl.domElement.style.cursor = "auto";
      setPreview(null);
      setDragging(false);
      if (controls.current) controls.current.enabled = true;
    }
  }, [editor?.disabled, gl]);

  function begin(event: ThreeEvent<PointerEvent>, id: string, index: number) {
    if (!editor || editor.disabled || event.button !== 0 || drag.current)
      return;
    event.stopPropagation();
    const point = event.ray.intersectPlane(
      new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.18),
      new THREE.Vector3(),
    );
    if (!point) return;
    const position = layoutHolePosition(
      placementFor(circuit.parts[index], index).hole,
    );
    const origin = new THREE.Vector3(position[0], 0.18, position[2] + 1);
    drag.current = {
      id,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offset: point.sub(origin),
      moved: false,
    };
    if (controls.current) controls.current.enabled = false;
    gl.domElement.setPointerCapture(event.pointerId);
    gl.domElement.style.cursor = "grabbing";
    setDragging(true);
    editor.onSelect(id);
  }
  return (
    <>
      <group position={[0, 0, 1]}>
        <group
          onClick={
            editor
              ? (event) => {
                  event.stopPropagation();
                  if (
                    editor.disabled ||
                    dragging ||
                    event.delta > 4 ||
                    !editor.selected
                  )
                    return;
                  const hole = nearestLayoutHole(
                    event.point.x,
                    event.point.z - 1,
                  );
                  if (hole) editor.onMove(editor.selected, hole);
                }
              : undefined
          }
        >
          <Breadboard />
        </group>
        <Controller circuit={displayed} />
        {displayed.parts.map(
          (part, i) =>
            (editor || i < step) && (
              <group
                key={part.id}
                onPointerDown={editor ? (e) => begin(e, part.id, i) : undefined}
                onClick={editor ? (e) => e.stopPropagation() : undefined}
                onPointerOver={
                  editor
                    ? () => {
                        if (!drag.current && !editor.disabled)
                          gl.domElement.style.cursor = "grab";
                      }
                    : undefined
                }
                onPointerOut={
                  editor
                    ? () => {
                        if (!drag.current) gl.domElement.style.cursor = "auto";
                      }
                    : undefined
                }
              >
                <Part
                  part={part}
                  holes={compiled.pinHoles}
                  active={!editor && i === step - 1 && !reduced}
                />
                {editor &&
                  (editor.selected === part.id ||
                    editor.invalidParts.includes(part.id)) &&
                  (() => {
                    const bounds = partBounds(displayed, i);
                    return (
                      <mesh position={[bounds.x, 0.21, bounds.z]}>
                        <boxGeometry
                          args={[
                            bounds.width + 0.12,
                            0.02,
                            bounds.depth + 0.12,
                          ]}
                        />
                        <meshBasicMaterial
                          color={
                            editor.invalidParts.includes(part.id)
                              ? "#fb7185"
                              : "#a5b4fc"
                          }
                          transparent
                          opacity={0.65}
                        />
                      </mesh>
                    );
                  })()}
              </group>
            ),
        )}
        {!editor &&
          step > circuit.parts.length &&
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
            (editor || i + circuit.parts.length < step) && (
              <AnimatedWire
                key={w.id}
                start={w.start.position}
                end={w.end.position}
                color={w.color}
                active={
                  !editor && i + circuit.parts.length === step - 1 && !reduced
                }
                index={i}
              />
            ),
        )}
        {preview && (
          <Label
            at={[
              layoutHolePosition(preview.hole)[0],
              1.8,
              layoutHolePosition(preview.hole)[2],
            ]}
            color="#c7d2fe"
          >
            {preview.id} → {preview.hole.toUpperCase()}
          </Label>
        )}
      </group>
      <OrbitControls
        ref={controls}
        enabled={!dragging}
        makeDefault
        target={[0, 0.3, -0.6]}
        enablePan
        minDistance={6}
        maxDistance={24}
        maxPolarAngle={Math.PI / 2.1}
      />
    </>
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
        <Text message="3D表示を開始できませんでした。「回路図」タブで接続を確認できます。" />
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
  editor,
}: {
  circuit: Circuit;
  step: number;
  view: "perspective" | "top";
  reset: number;
  editor?: SceneEditor;
}) {
  const { t, theme } = usePreferences();
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return (
    <SceneBoundary>
      <Canvas
        shadows="percentage"
        camera={{
          position: [7.8, 10.2, 9.8],
          fov: 39,
        }}
        dpr={[1, 1.6]}
        gl={{ antialias: true, alpha: true }}
        aria-label={t("ブレッドボードの3D配線モデル")}
        fallback={
          <div className="scene-fallback">
            {t(
              "WebGLを利用できません。3Dを表示できるブラウザをご利用ください。配置の変更は下の「配置する穴」からも行えます。",
            )}
          </div>
        }
      >
        <color
          attach="background"
          args={[theme === "light" ? "#dbe5ef" : "#0c1728"]}
        />
        <ambientLight intensity={0.45} />
        <hemisphereLight args={["#cfddff", "#273447", 0.65]} />
        <directionalLight
          position={[3, 8, 4]}
          intensity={1.35}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <pointLight position={[-4, 4, -4]} color="#818cf8" intensity={3.5} />
        <SceneWorkspace
          circuit={circuit}
          step={step}
          reduced={reduced}
          view={view}
          reset={reset}
          editor={editor}
        />
        <ContactShadows
          position={[0, -0.19, 0]}
          opacity={0.45}
          scale={20}
          blur={2.5}
          far={8}
        />
        <gridHelper
          args={[
            36,
            72,
            theme === "light" ? "#cbd5e1" : "#263a50",
            theme === "light" ? "#e2e8f0" : "#1b2a3e",
          ]}
          position={[0, -0.23, 0]}
        />
      </Canvas>
    </SceneBoundary>
  );
}
