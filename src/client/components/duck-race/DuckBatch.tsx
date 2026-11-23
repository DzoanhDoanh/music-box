import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Graphics } from './design';
type Batch = { mesh: THREE.InstancedMesh; far: THREE.InstancedMesh | null; sources: THREE.Mesh[] };
const mediumSphere = new THREE.SphereGeometry(1, 16, 10);
const farSphere = new THREE.SphereGeometry(1, 10, 7);
const lowSphere = new THREE.SphereGeometry(1, 12, 8);
/** Animate original multipart rigs, draw opaque parts in geometry batches across all ducks. */
export function DuckBatch({
  children,
  revision,
  quality,
}: {
  children: ReactNode;
  revision: string;
  quality: Graphics['quality'];
}) {
  const root = useRef<THREE.Group>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  useLayoutEffect(() => {
    const geometries = new Map<THREE.BufferGeometry, THREE.Mesh[]>();
    root.current?.traverse((object) => {
      if (
        !(object instanceof THREE.Mesh) ||
        !(object.material instanceof THREE.MeshStandardMaterial) ||
        object.material.transparent
      )
        return;
      const sources = geometries.get(object.geometry) ?? [];
      sources.push(object);
      geometries.set(object.geometry, sources);
    });
    const material = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.04 });
    const next: Batch[] = [...geometries.entries()].map(([geometry, sources]) => {
      const round = geometry instanceof THREE.SphereGeometry;
      const mesh = new THREE.InstancedMesh(
        round && quality !== 'HIGH' ? (quality === 'LOW' ? lowSphere : mediumSphere) : geometry,
        material,
        sources.length,
      );
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      const far = round ? new THREE.InstancedMesh(farSphere, material, sources.length) : null;
      if (far) {
        far.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        far.castShadow = true;
        far.frustumCulled = false;
      }
      sources.forEach((source, i) => {
        const color = (source.material as THREE.MeshStandardMaterial).color;
        mesh.setColorAt(i, color);
        far?.setColorAt(i, color);
        source.visible = false;
      });
      return { mesh, far, sources };
    });
    setBatches(next);
    return () => {
      next.forEach((batch) => {
        batch.sources.forEach((source) => {
          source.visible = true;
        });
        batch.mesh.dispose();
        batch.far?.dispose();
      });
      material.dispose();
    };
  }, [revision, quality]);
  useFrame(({ camera }) => {
    root.current?.updateWorldMatrix(true, true);
    for (const batch of batches) {
      let nearCount = 0,
        farCount = 0;
      batch.sources.forEach((source) => {
        let visible = true;
        for (let parent = source.parent; parent; parent = parent.parent)
          if (!parent.visible) {
            visible = false;
            break;
          }
        if (!visible) return;
        const m = source.matrixWorld.elements;
        const distance =
          (m[12] - camera.position.x) ** 2 +
          (m[13] - camera.position.y) ** 2 +
          (m[14] - camera.position.z) ** 2;
        const mesh =
          batch.far && distance > (quality === 'HIGH' ? 55 : 36) ** 2 ? batch.far : batch.mesh;
        const i = mesh === batch.far ? farCount++ : nearCount++;
        mesh.setMatrixAt(i, source.matrixWorld);
        mesh.setColorAt(i, (source.material as THREE.MeshStandardMaterial).color);
      });
      batch.mesh.count = nearCount;
      batch.mesh.instanceMatrix.needsUpdate = true;
      if (batch.mesh.instanceColor) batch.mesh.instanceColor.needsUpdate = true;
      if (batch.far) {
        batch.far.count = farCount;
        batch.far.instanceMatrix.needsUpdate = true;
        if (batch.far.instanceColor) batch.far.instanceColor.needsUpdate = true;
      }
    }
  });
  return (
    <>
      <group ref={root}>{children}</group>
      {batches.flatMap((batch, i) => [
        <primitive key={'near' + i} object={batch.mesh} />,
        batch.far && <primitive key={'far' + i} object={batch.far} />,
      ])}
    </>
  );
}
