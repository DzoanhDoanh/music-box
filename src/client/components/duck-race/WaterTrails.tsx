import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { DuckMotion } from './DuckFigure';

const ring = new THREE.RingGeometry(0.87, 1, 24);
const droplet = new THREE.SphereGeometry(0.05, 6, 4);
const foam = new THREE.MeshBasicMaterial({
  color: '#d4fff6',
  transparent: true,
  opacity: 0.3,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const spray = new THREE.MeshBasicMaterial({
  color: '#d7fff9',
  transparent: true,
  opacity: 0.75,
  depthWrite: false,
});

/** Two draw calls for the entire field, independent of participant count. */
export function WaterTrails({
  racers,
  motion,
  count,
  low,
  reduced,
}: {
  racers: MutableRefObject<(THREE.Group | null)[]>;
  motion: MutableRefObject<MutableRefObject<DuckMotion>[]>;
  count: number;
  low: boolean;
  reduced: boolean;
}) {
  const waves = useRef<THREE.InstancedMesh>(null),
    splashes = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const rings = low ? 2 : 3;
  useEffect(() => {
    const wave = waves.current,
      splash = splashes.current;
    return () => {
      wave?.dispose();
      splash?.dispose();
    };
  }, [rings, count, low, reduced]);
  useFrame(({ clock }) => {
    const t = reduced ? 0 : clock.elapsedTime;
    racers.current.forEach((group, index) => {
      if (!group) return;
      const speed = Math.min(2, motion.current[index]?.current.speed ?? 0);
      group.updateWorldMatrix(true, false);
      for (let i = 0; i < rings; i++) {
        const a = (t * 0.7 + i * 0.32 + index * 0.1) % 1;
        dummy.position.set(0, 0.06, -0.25 - a * (1.5 + speed));
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.set(0.5 + a * (0.6 + speed * 0.3), 0.55 + a * 0.5, 1);
        if (!group.visible) dummy.scale.setScalar(0);
        dummy.updateMatrix();
        waves.current?.setMatrixAt(
          index * rings + i,
          matrix.multiplyMatrices(group.matrixWorld, dummy.matrix),
        );
      }
      if (splashes.current)
        for (let i = 0; i < 4; i++) {
          const a = (t * 1.8 + i * 0.17 + index * 0.1) % 1;
          dummy.position.set(
            (i % 2 ? 1 : -1) * (0.6 + a * 0.45),
            Math.sin(a * Math.PI) * 0.36,
            -a * 1.4,
          );
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(group.visible ? (1 - a * 0.8) * Math.min(1.3, speed) : 0);
          dummy.updateMatrix();
          splashes.current.setMatrixAt(
            index * 4 + i,
            matrix.multiplyMatrices(group.matrixWorld, dummy.matrix),
          );
        }
    });
    if (waves.current) waves.current.instanceMatrix.needsUpdate = true;
    if (splashes.current) splashes.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <>
      <instancedMesh
        ref={waves}
        args={[ring, foam, count * rings]}
        dispose={null}
        frustumCulled={false}
      />
      {!low && !reduced && (
        <instancedMesh
          ref={splashes}
          args={[droplet, spray, count * 4]}
          dispose={null}
          frustumCulled={false}
        />
      )}
    </>
  );
}
