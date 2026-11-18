import { Shape } from 'three';
import type { PieceSkin } from '../../../shared/game/piece-skins';

type V3 = [number, number, number];
const ink = '#172135',
  ivory = '#fff1cf';
const knight = new Shape();
knight.moveTo(-0.27, 0.24);
knight.quadraticCurveTo(-0.35, 0.46, -0.14, 0.65);
knight.lineTo(-0.18, 0.83);
knight.lineTo(-0.34, 0.82);
knight.lineTo(-0.37, 0.98);
knight.lineTo(-0.17, 1.15);
knight.lineTo(0.02, 1.17);
knight.lineTo(0.12, 1.37);
knight.lineTo(0.22, 1.13);
knight.quadraticCurveTo(0.46, 0.84, 0.25, 0.53);
knight.lineTo(0.3, 0.24);
knight.closePath();
const star = new Shape();
for (let i = 0; i < 10; i++) {
  const angle = Math.PI / 2 + (i * Math.PI) / 5,
    radius = i % 2 ? 0.19 : 0.42;
  if (!i) star.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  else star.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
}
star.closePath();

function Orb({ at, size, color }: { at: V3; size: V3; color: string }) {
  return (
    <mesh position={at} scale={size} castShadow>
      <sphereGeometry args={[1, 16, 12]} />
      <meshStandardMaterial color={color} roughness={0.3} metalness={0.12} />
    </mesh>
  );
}
function Block({ at, size, color }: { at: V3; size: V3; color: string }) {
  return (
    <mesh position={at} castShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.3} metalness={0.25} />
    </mesh>
  );
}
function Spike({
  at,
  radius = 0.12,
  height = 0.3,
  color,
}: {
  at: V3;
  radius?: number;
  height?: number;
  color: string;
}) {
  return (
    <mesh position={at} castShadow>
      <coneGeometry args={[radius, height, 12]} />
      <meshStandardMaterial color={color} roughness={0.3} metalness={0.2} />
    </mesh>
  );
}
function Eyes({ y = 0.9, z = 0.24, spread = 0.12 }: { y?: number; z?: number; spread?: number }) {
  return (
    <>
      {[-1, 1].map((side) => (
        <Orb key={side} at={[side * spread, y, z]} size={[0.045, 0.055, 0.035]} color={ink} />
      ))}
    </>
  );
}

/** Original miniature models, generated locally; every saved skin has its own silhouette. */
export default function Figurine({ skin = 'HORSE', color }: { skin?: PieceSkin; color: string }) {
  const animal = ['CAT', 'DOG', 'RABBIT', 'BIRD', 'FISH', 'TURTLE'].includes(skin);
  const hero = ['HERO', 'MASKED_HERO', 'ROBOT', 'NINJA'].includes(skin);
  return (
    <group>
      <mesh position={[0, 0.05, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.36, 0.39, 0.1, 24]} />
        <meshStandardMaterial color={ink} roughness={0.35} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0.12, 0]} castShadow>
        <cylinderGeometry args={[0.29, 0.35, 0.09, 24]} />
        <meshStandardMaterial color={color} roughness={0.26} metalness={0.32} />
      </mesh>
      <mesh position={[0, 0.1, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.345, 0.018, 6, 24]} />
        <meshStandardMaterial color="#e8c98e" metalness={0.5} roughness={0.32} />
      </mesh>
      {skin === 'HORSE' && (
        <group rotation={[0, -0.2, 0]}>
          <mesh position={[0, -0.02, -0.13]} castShadow>
            <extrudeGeometry
              args={[
                knight,
                {
                  depth: 0.24,
                  bevelEnabled: true,
                  bevelSegments: 3,
                  steps: 1,
                  bevelSize: 0.045,
                  bevelThickness: 0.045,
                  curveSegments: 12,
                },
              ]}
            />
            <meshStandardMaterial color={color} roughness={0.27} metalness={0.18} />
          </mesh>
          <Orb at={[-0.15, 1.03, 0.16]} size={[0.045, 0.045, 0.025]} color={ink} />
          <Orb at={[-0.15, 1.03, -0.18]} size={[0.045, 0.045, 0.025]} color={ink} />
          <mesh position={[0, 0.27, 0]} castShadow>
            <cylinderGeometry args={[0.24, 0.28, 0.18, 20]} />
            <meshStandardMaterial color={color} roughness={0.32} metalness={0.12} />
          </mesh>
        </group>
      )}
      {animal && (
        <>
          <Orb
            at={[0, 0.45, 0]}
            size={
              skin === 'TURTLE'
                ? [0.36, 0.22, 0.36]
                : skin === 'FISH'
                  ? [0.3, 0.4, 0.18]
                  : [0.25, 0.34, 0.22]
            }
            color={color}
          />
          {skin === 'TURTLE' ? (
            <>
              <Orb at={[0, 0.47, 0.34]} size={[0.17, 0.15, 0.2]} color={color} />
              <Eyes y={0.51} z={0.5} spread={0.07} />
              {[-1, 1].flatMap((x) =>
                [-1, 1].map((z) => (
                  <Orb
                    key={x + ':' + z}
                    at={[x * 0.27, 0.26, z * 0.23]}
                    size={[0.12, 0.08, 0.15]}
                    color={ivory}
                  />
                )),
              )}
            </>
          ) : skin === 'FISH' ? (
            <>
              <mesh position={[-0.3, 0.52, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
                <coneGeometry args={[0.22, 0.34, 3]} />
                <meshStandardMaterial color={ivory} roughness={0.4} />
              </mesh>
              <Orb at={[0.13, 0.61, 0.16]} size={[0.045, 0.05, 0.025]} color={ink} />
              <Spike at={[0, 0.87, 0]} radius={0.12} height={0.25} color={color} />
            </>
          ) : (
            <>
              <Orb at={[0, 0.88, 0]} size={[0.3, 0.28, 0.26]} color={color} />
              {skin === 'CAT' &&
                [-1, 1].map((s) => <Spike key={s} at={[s * 0.19, 1.14, 0]} color={color} />)}
              {skin === 'DOG' &&
                [-1, 1].map((s) => (
                  <Orb key={s} at={[s * 0.29, 0.87, -0.02]} size={[0.1, 0.25, 0.13]} color={ink} />
                ))}
              {skin === 'RABBIT' &&
                [-1, 1].map((s) => (
                  <Orb
                    key={s}
                    at={[s * 0.13, 1.22, -0.04]}
                    size={[0.075, 0.3, 0.08]}
                    color={color}
                  />
                ))}
              {skin === 'BIRD' ? (
                <>
                  <mesh position={[0, 0.81, 0.32]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                    <coneGeometry args={[0.13, 0.24, 12]} />
                    <meshStandardMaterial color="#f4c064" />
                  </mesh>
                  {[-1, 1].map((s) => (
                    <Orb key={s} at={[s * 0.25, 0.5, 0]} size={[0.1, 0.23, 0.18]} color={ivory} />
                  ))}
                </>
              ) : (
                <Orb at={[0, 0.79, 0.24]} size={[0.16, 0.11, 0.1]} color={ivory} />
              )}
              <Eyes />
            </>
          )}
        </>
      )}
      {hero && (
        <>
          {skin === 'HERO' && (
            <mesh position={[0, 0.63, -0.2]} rotation={[0.18, 0, 0]} castShadow>
              <cylinderGeometry args={[0.13, 0.42, 0.84, 4, 1, true, 0, Math.PI]} />
              <meshStandardMaterial color={color} side={2} roughness={0.6} />
            </mesh>
          )}
          {[-1, 1].map((s) => (
            <group key={s}>
              <Block at={[s * 0.12, 0.3, 0]} size={[0.16, 0.23, 0.21]} color={ink} />
              <Orb
                at={[s * 0.28, 0.62, 0]}
                size={[0.1, 0.25, 0.12]}
                color={skin === 'NINJA' ? ink : color}
              />
            </group>
          ))}
          <Orb at={[0, 0.58, 0]} size={[0.24, 0.3, 0.18]} color={skin === 'NINJA' ? ink : color} />
          {skin === 'ROBOT' ? (
            <>
              <Block at={[0, 1.02, 0]} size={[0.56, 0.43, 0.42]} color={color} />
              <Block at={[0, 1.05, 0.22]} size={[0.43, 0.13, 0.03]} color={ink} />
              <Orb at={[0, 1.34, 0]} size={[0.06, 0.12, 0.06]} color={ivory} />
            </>
          ) : (
            <>
              <Orb
                at={[0, 1.01, 0]}
                size={[0.29, 0.3, 0.26]}
                color={skin === 'HERO' ? '#f5c7a6' : skin === 'NINJA' ? ink : color}
              />
              <Block
                at={[0, 1.04, 0.24]}
                size={[0.48, 0.11, 0.06]}
                color={skin === 'HERO' ? color : ivory}
              />
              {skin === 'HERO' && (
                <Orb at={[0, 1.23, -0.02]} size={[0.27, 0.12, 0.24]} color={ink} />
              )}
              {skin === 'MASKED_HERO' &&
                [-1, 1].map((s) => (
                  <Spike
                    key={s}
                    at={[s * 0.15, 1.35, 0]}
                    color={color}
                    radius={0.06}
                    height={0.23}
                  />
                ))}
            </>
          )}
          <Eyes y={1.04} z={0.285} />
          <mesh position={[0, 0.65, 0.19]}>
            <octahedronGeometry args={[0.105]} />
            <meshStandardMaterial color={ivory} emissive={color} emissiveIntensity={0.2} />
          </mesh>
        </>
      )}
      {skin === 'ROCKET' && (
        <>
          <Orb at={[0, 0.7, 0]} size={[0.23, 0.5, 0.23]} color={color} />
          <Orb at={[0, 0.82, 0.21]} size={[0.1, 0.1, 0.04]} color={ivory} />
          {[-1, 1].map((s) => (
            <Spike key={s} at={[s * 0.23, 0.38, 0]} height={0.4} color={color} />
          ))}
        </>
      )}
      {skin === 'CROWN' && (
        <>
          <mesh position={[0, 0.5, 0]} castShadow>
            <cylinderGeometry args={[0.32, 0.26, 0.53, 24]} />
            <meshStandardMaterial color={color} metalness={0.45} roughness={0.25} />
          </mesh>
          {[0, 1, 2, 3, 4].map((i) => (
            <Spike
              key={i}
              at={[Math.sin(i * Math.PI * 0.4) * 0.26, 0.89, Math.cos(i * Math.PI * 0.4) * 0.26]}
              color={color}
              radius={0.1}
              height={0.38}
            />
          ))}
        </>
      )}
      {skin === 'GEM' && (
        <mesh position={[0, 0.64, 0]} castShadow>
          <octahedronGeometry args={[0.48]} />
          <meshStandardMaterial color={color} metalness={0.42} roughness={0.16} />
        </mesh>
      )}
      {skin === 'GHOST' && (
        <>
          <Orb at={[0, 0.76, 0]} size={[0.3, 0.45, 0.26]} color={color} />
          <Eyes y={0.86} />
          {[-1, 1].map((s) => (
            <Orb key={s} at={[s * 0.31, 0.64, 0]} size={[0.14, 0.1, 0.1]} color={color} />
          ))}
        </>
      )}
      {skin === 'STAR' && (
        <mesh position={[0, 0.73, -0.08]} castShadow>
          <extrudeGeometry
            args={[
              star,
              {
                depth: 0.16,
                bevelEnabled: true,
                bevelSize: 0.04,
                bevelThickness: 0.04,
                bevelSegments: 2,
              },
            ]}
          />
          <meshStandardMaterial color={color} metalness={0.35} roughness={0.27} />
        </mesh>
      )}
    </group>
  );
}
