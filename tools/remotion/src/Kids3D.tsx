import { useThree } from "@react-three/fiber";
import { ThreeCanvas } from "@remotion/three";
import { useMemo } from "react";
import { AbsoluteFill, interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";
import * as THREE from "three";

// Bright, toy-like 3D scenes for the kids fact channel (made in code, no AI pictures needed).
export type Kids3DKind = "luarangkasa" | "bumi" | "laut" | "alam" | "sains" | "tatasurya" | "gunungberapi" | "dinosaurus";
export const KIDS3D_KINDS: Kids3DKind[] = ["luarangkasa", "bumi", "laut", "alam", "sains", "tatasurya", "gunungberapi", "dinosaurus"];

const W = 1080;
const H = 1920;

const SKY: Record<Kids3DKind, string> = {
  luarangkasa: "radial-gradient(circle at 50% 40%, #2a2f7a 0%, #0b0d2a 70%)",
  bumi: "radial-gradient(circle at 50% 45%, #1d3a7a 0%, #070b22 75%)",
  laut: "linear-gradient(180deg, #4fc3f7 0%, #0277bd 55%, #01395e 100%)",
  alam: "linear-gradient(180deg, #7fd4ff 0%, #bfe8ff 60%, #e9f8ff 100%)",
  sains: "radial-gradient(circle at 50% 45%, #3b2a7a 0%, #120b2a 75%)",
  tatasurya: "radial-gradient(circle at 50% 50%, #1a1446 0%, #05040f 75%)",
  gunungberapi: "linear-gradient(180deg, #3a1c2e 0%, #a0402a 45%, #f08a3c 75%, #f6c07a 100%)",
  dinosaurus: "linear-gradient(180deg, #8fd3c7 0%, #d8efc4 60%, #f3f0cf 100%)",
};

const Cam: React.FC<{ pos: [number, number, number]; look: [number, number, number] }> = ({ pos, look }) => {
  const { camera } = useThree();
  camera.position.set(...pos);
  camera.lookAt(...look);
  return null;
};

const StarField: React.FC<{ count: number; seed: string; spin: number }> = ({ count, seed, spin }) => {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 40 + random(`${seed}r${i}`) * 30;
      const th = random(`${seed}t${i}`) * Math.PI * 2;
      const ph = Math.acos(2 * random(`${seed}p${i}`) - 1);
      p.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)], i * 3);
    }
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    return g;
  }, [count, seed]);
  return (
    <points geometry={geo} rotation={[0, spin, 0]}>
      <pointsMaterial color="#fff6d8" size={0.35} sizeAttenuation />
    </points>
  );
};

const Space: React.FC<{ t: number }> = ({ t }) => (
  <>
    <Cam pos={[0, 4, 26]} look={[0, 0, 0]} />
    <ambientLight intensity={0.35} />
    <pointLight position={[-12, 6, 10]} intensity={900} color="#fff1c4" />
    <StarField count={500} seed="sp" spin={t * 0.02} />
    <group rotation={[0.35, t * 0.4, 0.1]}>
      <mesh>
        <sphereGeometry args={[3, 48, 32]} />
        <meshStandardMaterial color="#f4a261" roughness={0.8} />
      </mesh>
      <mesh rotation={[Math.PI / 2.3, 0, 0]}>
        <ringGeometry args={[4, 6, 64]} />
        <meshStandardMaterial color="#ffd166" side={THREE.DoubleSide} transparent opacity={0.8} />
      </mesh>
    </group>
    {[0, 1, 2].map((i) => {
      const a = t * (0.9 - i * 0.2) + i * 2;
      const r = 7 + i * 1.6;
      return (
        <mesh key={i} position={[Math.cos(a) * r, Math.sin(a * 0.6) * 1.2, Math.sin(a) * r]}>
          <sphereGeometry args={[0.45 + i * 0.15, 24, 16]} />
          <meshStandardMaterial color={["#cfd8dc", "#90caf9", "#ef9a9a"][i]} />
        </mesh>
      );
    })}
  </>
);

const Earth: React.FC<{ t: number }> = ({ t }) => {
  // stylised continents: flattened green blobs stuck on the ocean sphere
  const blobs = useMemo(
    () =>
      Array.from({ length: 26 }).map((_, i) => {
        const th = random(`et${i}`) * Math.PI * 2;
        const ph = Math.acos(2 * random(`ep${i}`) - 1);
        return { pos: new THREE.Vector3().setFromSphericalCoords(3.02, ph, th), s: 0.5 + random(`es${i}`) * 0.9 };
      }),
    [],
  );
  return (
    <>
      <Cam pos={[0, 1, 17]} look={[0, 0, 0]} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[-6, 4, 8]} intensity={2.2} />
      <StarField count={400} seed="ea" spin={t * 0.01} />
      <group rotation={[0.4, t * 0.35, 0]}>
        <mesh>
          <sphereGeometry args={[3, 64, 48]} />
          <meshStandardMaterial color="#1e88e5" roughness={0.6} />
        </mesh>
        {blobs.map((b, i) => (
          <mesh key={i} position={b.pos} scale={[b.s, b.s, 0.12]} onUpdate={(m) => m.lookAt(0, 0, 0)}>
            <sphereGeometry args={[1, 16, 12]} />
            <meshStandardMaterial color={i % 5 === 0 ? "#d7ccc8" : "#43a047"} />
          </mesh>
        ))}
      </group>
      <mesh rotation={[0.4, t * 0.5, 0]}>
        <sphereGeometry args={[3.25, 48, 32]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.12} />
      </mesh>
    </>
  );
};

const Fish: React.FC<{ i: number; t: number }> = ({ i, t }) => {
  const y = -3 + random(`fy${i}`) * 7;
  const z = -6 + random(`fz${i}`) * 6;
  const speed = 1.2 + random(`fs${i}`) * 1.2;
  const x = ((t * speed + random(`fx${i}`) * 24) % 24) - 12;
  const color = ["#ff7043", "#ffca28", "#ab47bc", "#26c6da", "#ef5350"][i % 5];
  return (
    <group position={[x, y + Math.sin(t * 2 + i) * 0.3, z]} rotation={[0, 0, Math.sin(t * 6 + i) * 0.1]}>
      <mesh scale={[1.3, 0.8, 0.5]}>
        <sphereGeometry args={[0.6, 20, 14]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[-0.95, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <coneGeometry args={[0.45, 0.7, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0.5, 0.12, 0.28]}>
        <sphereGeometry args={[0.1, 10, 8]} />
        <meshStandardMaterial color="#111" />
      </mesh>
    </group>
  );
};

const Sea: React.FC<{ t: number }> = ({ t }) => (
  <>
    <Cam pos={[0, 0.5, 15]} look={[0, 0, 0]} />
    <ambientLight intensity={0.8} color="#b3e5fc" />
    <directionalLight position={[0, 10, 5]} intensity={1.6} color="#e1f5fe" />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -5, 0]}>
      <planeGeometry args={[60, 60]} />
      <meshStandardMaterial color="#f2d7a1" />
    </mesh>
    {Array.from({ length: 9 }).map((_, i) => (
      <mesh key={i} position={[-8 + i * 2, -3.6, -3 - (i % 3)]} rotation={[0, 0, Math.sin(t * 1.5 + i) * 0.15]}>
        <cylinderGeometry args={[0.12, 0.2, 3 + (i % 3), 8]} />
        <meshStandardMaterial color="#2e7d32" />
      </mesh>
    ))}
    {Array.from({ length: 7 }).map((_, i) => (
      <Fish key={i} i={i} t={t} />
    ))}
    {Array.from({ length: 30 }).map((_, i) => {
      const y = ((t * (0.8 + random(`by${i}`)) + random(`bo${i}`) * 12) % 12) - 5;
      return (
        <mesh key={i} position={[-7 + random(`bx${i}`) * 14, y, -2 + random(`bz${i}`) * 4]}>
          <sphereGeometry args={[0.08 + random(`br${i}`) * 0.12, 10, 8]} />
          <meshStandardMaterial color="#e1f5fe" transparent opacity={0.6} />
        </mesh>
      );
    })}
  </>
);

const Nature: React.FC<{ t: number }> = ({ t }) => (
  <>
    <Cam pos={[Math.sin(t * 0.15) * 3, 3, 14]} look={[0, 0.5, 0]} />
    <hemisphereLight args={["#ffffff", "#7cb342", 1.2]} />
    <directionalLight position={[6, 10, 6]} intensity={1.8} color="#fff3e0" />
    <mesh position={[5, 7, -12]}>
      <sphereGeometry args={[1.8, 32, 24]} />
      <meshBasicMaterial color="#ffd54f" />
    </mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]}>
      <circleGeometry args={[40, 48]} />
      <meshStandardMaterial color="#8bc34a" />
    </mesh>
    {[[-6, -8, 7], [4, -10, 9], [10, -9, 6]].map(([x, z, r], i) => (
      <mesh key={i} position={[x, -1, z]} scale={[1, 0.45, 1]}>
        <sphereGeometry args={[r, 32, 16]} />
        <meshStandardMaterial color={["#7cb342", "#689f38", "#9ccc65"][i]} />
      </mesh>
    ))}
    {Array.from({ length: 12 }).map((_, i) => {
      const x = -9 + random(`tx${i}`) * 18;
      const z = -4 + random(`tz${i}`) * 6;
      const s = 0.8 + random(`ts${i}`) * 0.7;
      return (
        <group key={i} position={[x, -1, z]} scale={s} rotation={[0, 0, Math.sin(t * 1.2 + i) * 0.04]}>
          <mesh position={[0, 0.7, 0]}>
            <cylinderGeometry args={[0.15, 0.2, 1.4, 8]} />
            <meshStandardMaterial color="#795548" />
          </mesh>
          <mesh position={[0, 2, 0]}>
            <coneGeometry args={[0.9, 2.2, 10]} />
            <meshStandardMaterial color="#2e7d32" />
          </mesh>
        </group>
      );
    })}
    {Array.from({ length: 3 }).map((_, i) => (
      <mesh key={i} position={[((t * 0.6 + i * 6) % 22) - 11, 6 + i * 0.8, -6]} scale={[1.6, 0.7, 0.8]}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
    ))}
  </>
);

const Atom: React.FC<{ t: number }> = ({ t }) => (
  <>
    <Cam pos={[0, 0, 19]} look={[0, 0, 0]} />
    <ambientLight intensity={0.5} />
    <pointLight position={[5, 5, 8]} intensity={600} color="#ffffff" />
    <StarField count={250} seed="at" spin={t * 0.03} />
    <group rotation={[0, t * 0.4, 0]}>
      {Array.from({ length: 6 }).map((_, i) => (
        <mesh key={i} position={[Math.sin(i * 2.1) * 0.6, Math.cos(i * 1.7) * 0.6, Math.sin(i * 1.3) * 0.6]}>
          <sphereGeometry args={[0.65, 24, 16]} />
          <meshStandardMaterial color={i % 2 ? "#ef5350" : "#42a5f5"} />
        </mesh>
      ))}
    </group>
    {[0, 1, 2].map((i) => {
      const tilt = (i * Math.PI) / 3;
      const a = t * (2 + i * 0.4) + i;
      return (
        <group key={i} rotation={[Math.PI / 2.5, tilt, 0]}>
          <mesh>
            <torusGeometry args={[4.2, 0.04, 8, 96]} />
            <meshBasicMaterial color="#b39ddb" />
          </mesh>
          <mesh position={[Math.cos(a) * 4.2, Math.sin(a) * 4.2, 0]}>
            <sphereGeometry args={[0.3, 16, 12]} />
            <meshBasicMaterial color="#ffee58" />
          </mesh>
        </group>
      );
    })}
  </>
);

// Full solar system: glowing sun, eight planets on their own orbits and speeds (sizes/distances are not to scale).
const PLANETS = [
  { r: 0.35, d: 4.2, c: "#b0a59a", sp: 1.6 }, // Merkurius
  { r: 0.55, d: 5.6, c: "#e8c27a", sp: 1.2 }, // Venus
  { r: 0.6, d: 7.2, c: "#2e86de", sp: 1.0 }, // Bumi
  { r: 0.45, d: 8.7, c: "#d35400", sp: 0.8 }, // Mars
  { r: 1.3, d: 11.2, c: "#d9a066", sp: 0.45 }, // Jupiter
  { r: 1.05, d: 14.0, c: "#f0d58a", sp: 0.35, ring: true }, // Saturnus
  { r: 0.8, d: 16.4, c: "#8fd6e8", sp: 0.25 }, // Uranus
  { r: 0.78, d: 18.6, c: "#3f6fd8", sp: 0.2 }, // Neptunus
];

const SolarSystem: React.FC<{ t: number }> = ({ t }) => (
  <>
    <Cam pos={[Math.sin(t * 0.08) * 4, 30, 34]} look={[0, 0, 0]} />
    <ambientLight intensity={0.6} />
    <pointLight position={[0, 0, 0]} intensity={3500} decay={2} color="#fff3d0" />
    <StarField count={700} seed="ss" spin={t * 0.01} />
    <mesh>
      <sphereGeometry args={[2.6, 48, 32]} />
      <meshBasicMaterial color="#ffcc33" />
    </mesh>
    <mesh scale={1 + Math.sin(t * 3) * 0.03}>
      <sphereGeometry args={[3.4, 32, 24]} />
      <meshBasicMaterial color="#ff9f1a" transparent opacity={0.25} />
    </mesh>
    {PLANETS.map((p, i) => {
      const a = t * p.sp + i * 1.7;
      return (
        <group key={i}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[p.d - 0.03, p.d + 0.03, 128]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.18} side={THREE.DoubleSide} />
          </mesh>
          <group position={[Math.cos(a) * p.d, 0, Math.sin(a) * p.d]}>
            <mesh rotation={[0, t, 0]}>
              <sphereGeometry args={[p.r * 1.5, 32, 24]} />
              <meshStandardMaterial color={p.c} roughness={0.7} />
            </mesh>
            {p.ring ? (
              <mesh rotation={[Math.PI / 2.4, 0, 0]}>
                <ringGeometry args={[p.r * 2.1, p.r * 3.1, 64]} />
                <meshStandardMaterial color="#e9d9a6" side={THREE.DoubleSide} transparent opacity={0.85} />
              </mesh>
            ) : null}
          </group>
        </group>
      );
    })}
  </>
);

// Erupting volcano: glowing crater, lava bombs flying out and falling back, smoke puffs rising and growing.
const Volcano: React.FC<{ t: number }> = ({ t }) => (
  <>
    <Cam pos={[0, 6, 38]} look={[0, 6, 0]} />
    <hemisphereLight args={["#ffb37a", "#3b2418", 0.9]} />
    <pointLight position={[0, 9, 2]} intensity={700} color="#ff5a1f" />
    <directionalLight position={[-8, 10, 8]} intensity={0.8} color="#ffd1a3" />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]}>
      <circleGeometry args={[60, 48]} />
      <meshStandardMaterial color="#4e342e" />
    </mesh>
    <mesh position={[0, 3.5, -2]}>
      <cylinderGeometry args={[1.6, 7, 9, 24, 1, true]} />
      <meshStandardMaterial color="#5d4037" flatShading side={THREE.DoubleSide} />
    </mesh>
    <mesh position={[0, 7.9, -2]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[1.6, 24]} />
      <meshBasicMaterial color="#ff6d00" />
    </mesh>
    {/* lava streams down the side */}
    {[-0.6, 0.5].map((x, i) => (
      <mesh key={i} position={[x * 2.5, 4, 0.6]} rotation={[0.42, 0, x * 0.5]}>
        <boxGeometry args={[0.5, 8, 0.2]} />
        <meshBasicMaterial color={i ? "#ff8f00" : "#ff5722"} />
      </mesh>
    ))}
    {Array.from({ length: 24 }).map((_, i) => {
      const period = 2.2 + random(`lp${i}`) * 1.2;
      const k = ((t + random(`lo${i}`) * period) % period) / period;
      const vx = (random(`lx${i}`) - 0.5) * 7;
      const vy = 9 + random(`ly${i}`) * 5;
      const x = vx * k * 2;
      const y = 8 + vy * k * 2 - 14 * k * k * 2;
      return (
        <mesh key={i} position={[x, y, -2 + (random(`lz${i}`) - 0.5) * 3]}>
          <sphereGeometry args={[0.22 + random(`ls${i}`) * 0.2, 10, 8]} />
          <meshBasicMaterial color={i % 3 ? "#ffab00" : "#ff3d00"} />
        </mesh>
      );
    })}
    {Array.from({ length: 10 }).map((_, i) => {
      const k = ((t * 0.25 + i / 10) % 1);
      return (
        <mesh key={i} position={[Math.sin(i * 2.3) * (0.5 + k * 2), 9.5 + k * 10, -3]} scale={0.6 + k * 1.8}>
          <sphereGeometry args={[1, 16, 12]} />
          <meshBasicMaterial color="#5a5a5a" transparent opacity={0.6 * (1 - k)} />
        </mesh>
      );
    })}
  </>
);

// Long-necked dinosaur (sauropod) strolling through a prehistoric valley with ferns, palms and a smoking volcano.
const Dino: React.FC<{ t: number; x: number; z: number; s: number; color: string; phase: number }> = ({ t, x, z, s, color, phase }) => {
  const step = t * 3 + phase;
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh position={[0, 2.6 + Math.abs(Math.sin(step)) * 0.08, 0]} scale={[2.4, 1.2, 1.2]}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* neck + head */}
      <group position={[2, 3.2, 0]} rotation={[0, 0, -0.9 + Math.sin(step * 0.5) * 0.06]}>
        <mesh position={[0, 1.8, 0]}>
          <cylinderGeometry args={[0.32, 0.55, 3.8, 12]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[0.25, 3.8, 0]} scale={[1.3, 0.8, 0.8]}>
          <sphereGeometry args={[0.55, 16, 12]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[0.55, 3.95, 0.35]}>
          <sphereGeometry args={[0.1, 8, 6]} />
          <meshStandardMaterial color="#111" />
        </mesh>
      </group>
      {/* tail */}
      <mesh position={[-3.2, 2.4, 0]} rotation={[0, Math.sin(step * 0.5) * 0.15, Math.PI / 2 + 0.25]}>
        <coneGeometry args={[0.55, 3.6, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* legs swing in pairs */}
      {[[1.2, 0.6, 0], [1.2, -0.6, Math.PI], [-1.2, 0.6, Math.PI], [-1.2, -0.6, 0]].map(([lx, lz, ph], i) => (
        <mesh key={i} position={[lx, 1.0, lz]} rotation={[0, 0, Math.sin(step + ph) * 0.35]}>
          <cylinderGeometry args={[0.32, 0.36, 2.2, 10]} />
          <meshStandardMaterial color={color} />
        </mesh>
      ))}
    </group>
  );
};

const Prehistoric: React.FC<{ t: number }> = ({ t }) => (
  <>
    <Cam pos={[0, 5, 24]} look={[0, 3, 0]} />
    <hemisphereLight args={["#ffffff", "#6d8b3a", 1.1]} />
    <directionalLight position={[8, 12, 8]} intensity={1.8} color="#fff1d6" />
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[70, 48]} />
      <meshStandardMaterial color="#9ccc65" />
    </mesh>
    <mesh position={[5, 7, -30]}>
      <coneGeometry args={[11, 16, 8]} />
      <meshStandardMaterial color="#6d4c41" flatShading />
    </mesh>
    {Array.from({ length: 6 }).map((_, i) => {
      const k = ((t * 0.2 + i / 6) % 1);
      return (
        <mesh key={i} position={[5, 15 + k * 8, -30]} scale={1 + k * 2.5}>
          <sphereGeometry args={[1.2, 12, 10]} />
          <meshStandardMaterial color="#9e9e9e" transparent opacity={0.6 * (1 - k)} />
        </mesh>
      );
    })}
    {Array.from({ length: 10 }).map((_, i) => {
      const x = -9 + i * 2 + random(`px${i}`) * 1.2;
      const z = -10 - random(`pz${i}`) * 8;
      return (
        <group key={i} position={[x, 0, z]} rotation={[0, 0, Math.sin(t + i) * 0.03]}>
          <mesh position={[0, 2.5, 0]}>
            <cylinderGeometry args={[0.2, 0.3, 5, 8]} />
            <meshStandardMaterial color="#6d4c41" />
          </mesh>
          {[0, 1, 2, 3, 4].map((j) => (
            <mesh key={j} position={[0, 5, 0]} rotation={[0.9, (j / 5) * Math.PI * 2, 0]}>
              <coneGeometry args={[0.35, 3, 6]} />
              <meshStandardMaterial color="#388e3c" />
            </mesh>
          ))}
        </group>
      );
    })}
    <Dino t={t} x={-4 + t * 0.6} z={0} s={0.9} color="#7e9a5b" phase={0} />
    <Dino t={t} x={1 + t * 0.6} z={-6} s={0.55} color="#8fae68" phase={1.3} />
  </>
);

export const Kids3D: React.FC<{ kind: Kids3DKind; dur: number }> = ({ kind, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const zoom = interpolate(frame / (dur * fps), [0, 1], [1, 1.08]);
  return (
    <AbsoluteFill style={{ background: SKY[kind] }}>
      <AbsoluteFill style={{ scale: String(zoom) }}>
        <ThreeCanvas width={W} height={H} camera={{ fov: 50 }} gl={{ alpha: true }}>
          {kind === "luarangkasa" && <Space t={t} />}
          {kind === "bumi" && <Earth t={t} />}
          {kind === "laut" && <Sea t={t} />}
          {kind === "alam" && <Nature t={t} />}
          {kind === "sains" && <Atom t={t} />}
          {kind === "tatasurya" && <SolarSystem t={t} />}
          {kind === "gunungberapi" && <Volcano t={t} />}
          {kind === "dinosaurus" && <Prehistoric t={t} />}
        </ThreeCanvas>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
