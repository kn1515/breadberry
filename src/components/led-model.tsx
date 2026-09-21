"use client";
import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { ledModelUrl, type LedColor } from "@/lib/led";

/** A color-specific glTF asset shared by the board and the model picker. */
export default function LedModel({
  color,
  showLeads = false,
}: {
  color: LedColor;
  showLeads?: boolean;
}) {
  const { scene } = useGLTF(ledModelUrl(color));
  const model = useMemo(() => {
    const copy = scene.clone(true);
    const leads = copy.getObjectByName("leads");
    if (leads) leads.visible = showLeads;
    copy.traverse((object) => {
      object.castShadow = true;
    });
    return copy;
  }, [scene, showLeads]);
  // Instances share cached geometry/materials; unmounting must not dispose them.
  return <primitive object={model} dispose={null} />;
}
