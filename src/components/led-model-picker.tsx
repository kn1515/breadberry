"use client";
import { Component, Suspense, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import LedModel from "./led-model";
import { ledColorNames, ledColors, type LedColor } from "@/lib/led";

class PreviewBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p>3Dプレビューを表示できません。下の色名から選択できます。</p>
    ) : (
      this.props.children
    );
  }
}

export default function LedModelPicker({
  value,
  onChange,
  disabled,
}: {
  value: LedColor;
  onChange: (color: LedColor) => void;
  disabled: boolean;
}) {
  return (
    <details className="led-model-picker" open>
      <summary>LEDの色別3Dモデル</summary>
      <p>追加するLEDを選択して「パーツを追加」を押してください。</p>
      <div className="led-model-preview">
        <PreviewBoundary>
          <Canvas
            orthographic
            camera={{ position: [0, 0, 5], zoom: 82 }}
            dpr={[1, 1.5]}
            frameloop="demand"
            aria-label="8色のLEDモデルプレビュー"
            fallback={<p>下の色名からLEDを選択してください。</p>}
          >
            <ambientLight intensity={1.4} />
            <directionalLight position={[2, 3, 5]} intensity={2} />
            <Suspense fallback={null}>
              {ledColorNames.map((color, i) => (
                <group
                  key={color}
                  position={[((i % 4) - 1.5) * 0.82, i < 4 ? 0.58 : -0.58, 0]}
                  rotation={[0.1, -0.2, -0.12]}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!disabled) onChange(color);
                  }}
                >
                  <LedModel color={color} showLeads />
                  {value === color && (
                    <mesh position={[0, -0.05, -0.1]}>
                      <ringGeometry args={[0.43, 0.45, 48]} />
                      <meshBasicMaterial color={ledColors[color].color} />
                    </mesh>
                  )}
                </group>
              ))}
            </Suspense>
          </Canvas>
        </PreviewBoundary>
      </div>
      <div
        className="led-model-options"
        role="group"
        aria-label="LEDモデルの色"
      >
        {ledColorNames.map((color) => (
          <button
            key={color}
            type="button"
            disabled={disabled}
            aria-pressed={value === color}
            aria-label={`${ledColors[color].label}のLEDモデルを選択`}
            onClick={() => onChange(color)}
          >
            <span
              style={{ background: ledColors[color].color }}
              aria-hidden="true"
            />
            {ledColors[color].label}
          </button>
        ))}
      </div>
    </details>
  );
}
