import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { displayFinished, type RacePlayback } from './playback';

/** Original, bounded GPU particle bursts. They never drive gameplay or random results. */
export function Fireworks({
  view,
  count,
}: {
  view: MutableRefObject<RacePlayback>;
  count: number;
}) {
  const points = useRef<THREE.Points>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  const geometry = useMemo(() => {
    const position: number[] = [],
      velocity: number[] = [],
      color: number[] = [],
      delay: number[] = [];
    const palette = ['#ffe598', '#ff92be', '#84f4e4', '#c5a4ff'];
    for (let i = 0; i < count; i++) {
      const burst = i % 4,
        a = i * 2.39996,
        y = Math.sin(i * 7.13),
        r = Math.sqrt(1 - y * y);
      position.push((burst % 2 ? 1 : -1) * (6 + burst * 0.7), 5.5 + burst * 0.5, 2 + burst);
      velocity.push(Math.cos(a) * r * 3, y * 3.2, Math.sin(a) * r * 3);
      const tint = new THREE.Color(palette[burst]);
      color.push(tint.r, tint.g, tint.b);
      delay.push(burst * 0.85);
    }
    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    result.setAttribute('velocity', new THREE.Float32BufferAttribute(velocity, 3));
    result.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
    result.setAttribute('delay', new THREE.Float32BufferAttribute(delay, 1));
    return result;
  }, [count]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(({ clock }) => {
    uniforms.uTime.value = clock.elapsedTime;
    if (points.current)
      points.current.visible = displayFinished(view.current) && !view.current.replay;
  });
  return (
    <points ref={points} geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        vertexShader={`attribute vec3 velocity; attribute float delay; varying vec3 vColor; varying float vAlpha; uniform float uTime;
        void main(){ float t=mod(uTime-delay+20.,4.8); float age=min(t,2.3); vColor=color; vAlpha=t<2.3?pow(1.-age/2.3,1.4):0.;
        vec3 p=position+velocity*age; p.y-=age*age*1.2; vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; gl_PointSize=clamp(110./-mv.z,1.5,7.); }`}
        fragmentShader={`varying vec3 vColor; varying float vAlpha; void main(){ float d=length(gl_PointCoord-.5); gl_FragColor=vec4(vColor,vAlpha*smoothstep(.5,.05,d));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`}
        vertexColors
      />
    </points>
  );
}
