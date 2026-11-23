import { Canvas } from '@react-three/fiber';
import { Component, useState, type ReactNode } from 'react';
import { DuckFigure } from './DuckFigure';
import { skins } from './design';
import type { DuckSkin } from '../../../shared/duck-race/contracts';
class PreviewBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
export default function DuckPreview({
  skin,
  reduced = false,
  twoD = false,
}: {
  skin: DuckSkin;
  reduced?: boolean;
  twoD?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const fallback = (
    <div className="duck-preview-fallback" role="img" aria-label={skins[skin].name}>
      <span aria-hidden="true">{skins[skin].icon}</span>
      <small>{skins[skin].name}</small>
    </div>
  );
  if (failed || twoD) return fallback;
  return (
    <PreviewBoundary fallback={fallback}>
      <Canvas
        dpr={[1, 1.5]}
        camera={{ fov: 40, position: [2.7, 2.5, 4.5] }}
        gl={{ alpha: true }}
        fallback={fallback}
        onCreated={({ gl }) => {
          gl.debug.onShaderError = () => queueMicrotask(() => setFailed(true));
          gl.domElement.addEventListener('webglcontextlost', () => setFailed(true), { once: true });
        }}
      >
        <ambientLight intensity={2.3} />
        <directionalLight position={[3, 6, 4]} intensity={3} />
        <group position={[0, -0.65, 0]} rotation={[0, -0.3, 0]}>
          <DuckFigure skin={skin} swimming={false} reduced={reduced} />
        </group>
      </Canvas>
    </PreviewBoundary>
  );
}
