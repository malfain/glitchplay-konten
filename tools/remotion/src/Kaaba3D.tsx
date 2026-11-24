import { useThree } from "@react-three/fiber";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

// 3D Kaaba at dusk for the sirah channel: a slow camera orbit around the Kaaba (black cube, gold band) standing on a
// pale stone court, ringed by simple arcades, with the valley mountains behind. No people.
const W = 1080;
const H = 1920;

const Arcade: React.FC<{ radius: number; count: number }> = ({ radius, count }) => (
  <group>
    {Array.from({ length: count }).map((_, i) => {
      const a = (i / count) * Math.PI * 2;
      return (
        <group key={i} position={[Math.cos(a) * radius, 0, Math.sin(a) * radius]} rotation={[0, -a, 0]}>
          <mesh position={[0, 0.9, 0]}>
            <boxGeometry args={[0.35, 1.8, 0.35]} />
            <meshStandardMaterial color="#d9c9a8" />
          </mesh>
          <mesh position={[0, 1.95, 0]}>
            <sphereGeometry args={[0.32, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#cdb990" />
          </mesh>
        </group>
      );
    })}
    <mesh position={[0, 1.85, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[radius, 0.12, 8, 64]} />
      <meshStandardMaterial color="#c9b48a" />
    </mesh>
  </group>
);

const Mountains: React.FC = () => (
  <group>
    {Array.from({ length: 14 }).map((_, i) => {
      const a = (i / 14) * Math.PI * 2;
      const h = 4 + ((i * 37) % 5);
      return (
        <mesh key={i} position={[Math.cos(a) * 34, h / 2 - 0.5, Math.sin(a) * 34]}>
          <coneGeometry args={[7, h * 1.6, 5]} />
          <meshStandardMaterial color="#5b4636" flatShading />
        </mesh>
      );
    })}
  </group>
);

export const Kaaba3D: React.FC<{ dur: number; index: number }> = ({ dur, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = frame / (dur * fps);
  const angle = (index * 1.3) + interpolate(p, [0, 1], [0, 0.9]);
  const dist = interpolate(p, [0, 1], [11.5, 10]);
  const camY = interpolate(p, [0, 1], [3.2, 2.6]);
  return (
    <AbsoluteFill style={{ background: "linear-gradient(180deg, #2a2f5c 0%, #8d5a63 45%, #f0b778 75%, #f7d29a 100%)" }}>
      <ThreeCanvas width={W} height={H} camera={{ fov: 42, position: [Math.cos(angle) * dist, camY, Math.sin(angle) * dist] }}
        gl={{ alpha: true }}>
        <CameraAim angle={angle} dist={dist} y={camY} />
        <ambientLight intensity={0.55} color="#ffe2c0" />
        <directionalLight position={[-6, 8, 4]} intensity={1.6} color="#ffd39a" />
        <directionalLight position={[5, 3, -6]} intensity={0.35} color="#9fb3ff" />
        {/* court */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <circleGeometry args={[60, 64]} />
          <meshStandardMaterial color="#e9e0cf" />
        </mesh>
        {/* Kaaba */}
        <mesh position={[0, 1.5, 0]}>
          <boxGeometry args={[2.4, 3, 2.1]} />
          <meshStandardMaterial color="#101010" roughness={0.85} />
        </mesh>
        <mesh position={[0, 2.25, 0]}>
          <boxGeometry args={[2.43, 0.28, 2.13]} />
          <meshStandardMaterial color="#f2c14e" emissive="#8a6410" emissiveIntensity={0.6} metalness={0.4} roughness={0.35} />
        </mesh>
        {/* door */}
        <mesh position={[0.5, 1.25, 1.06]}>
          <boxGeometry args={[0.55, 1.0, 0.03]} />
          <meshStandardMaterial color="#f0bd4a" emissive="#7a560c" emissiveIntensity={0.5} metalness={0.4} roughness={0.3} />
        </mesh>
        <Arcade radius={17} count={40} />
        <Mountains />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};

// keeps the camera pointed at the Kaaba every frame while it orbits
const CameraAim: React.FC<{ angle: number; dist: number; y: number }> = ({ angle, dist, y }) => {
  const { camera } = useThree();
  camera.position.set(Math.cos(angle) * dist, y, Math.sin(angle) * dist);
  camera.lookAt(0, 2.2, 0);
  return null;
};
