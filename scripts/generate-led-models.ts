import { mkdir, writeFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { ledColorNames, ledColors } from "../src/lib/led";

// GLTFExporter uses this browser API to embed its geometry buffer.
class NodeFileReader {
  result: string | ArrayBuffer | null = null;
  onloadend: (() => void) | null = null;
  async readAsArrayBuffer(blob: Blob) {
    this.result = await blob.arrayBuffer();
    this.onloadend?.();
  }
  async readAsDataURL(blob: Blob) {
    const bytes = Buffer.from(await blob.arrayBuffer());
    this.result = `data:${blob.type};base64,${bytes.toString("base64")}`;
    this.onloadend?.();
  }
}
Object.assign(globalThis, { FileReader: NodeFileReader });
const output = new URL("../public/models/led/", import.meta.url);
await mkdir(output, { recursive: true });
for (const color of ledColorNames) {
  const palette = ledColors[color];
  const model = new THREE.Group();
  model.name = `LED_${color}`;
  model.userData = { ledColor: color, label: `${palette.label} LED` };
  const lens = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.16, 0.15, 6, 20),
    new THREE.MeshPhysicalMaterial({
      color: palette.color,
      emissive: palette.emissive,
      emissiveIntensity: 0.18,
      roughness: 0.24,
      clearcoat: 1,
      clearcoatRoughness: 0.15,
    }),
  );
  lens.name = "lens";
  lens.position.y = 0.19;
  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.2, 0.055, 24),
    new THREE.MeshStandardMaterial({ color: palette.base, roughness: 0.35 }),
  );
  collar.name = "collar";
  const leads = new THREE.Group();
  leads.name = "leads";
  for (const [i, length] of [0.5, 0.4].entries()) {
    const lead = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, length, 8),
      new THREE.MeshStandardMaterial({
        color: "#b7c6d8",
        metalness: 0.65,
        roughness: 0.3,
      }),
    );
    lead.name = i === 0 ? "anode" : "cathode";
    lead.position.set(i === 0 ? -0.12 : 0.12, -length / 2, 0);
    leads.add(lead);
  }
  model.add(lens, collar, leads);
  const gltf = await new GLTFExporter().parseAsync(model, { binary: false });
  await writeFile(new URL(`led-${color}.gltf`, output), JSON.stringify(gltf));
  model.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    }
  });
}
console.log(`Generated ${ledColorNames.length} LED glTF models.`);
