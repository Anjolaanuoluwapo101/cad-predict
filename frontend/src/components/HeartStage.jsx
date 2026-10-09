import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { riskColour, formatProb, statusLabel, TARGETS } from '../lib/risk';
import './HeartStage.css';

const MODEL = '/models/heart_bp3d.glb';
const VESSELS = ['LAD', 'LCX', 'RCA'];
const NEUTRAL = '#9AA3AB';
const TISSUE = {
  Heart_body: '#C7A09D', Atrial_appendage: '#BC918F', Aorta: '#D6B5A6',
  Pulmonary_trunk: '#8EA4C2', Veins: '#7E93B6', Valves: '#E6DAC8',
  AV_valves: '#E6DAC8', Ligament: '#CBBDA6', LeftMain: '#8A949C',
};
const FIT = 3;             // the model is scaled so its longest side is this many units
const OVERVIEW_DIST = 8.5;   // camera distance for the whole heart
const VESSEL_DIST = 2.4;   // camera distance when a vessel is selected

// Once the sliders in the dev panel show the right orientation, paste the three numbers here (degrees).
export const DEFAULT_ROTATION = [-90, 0, 0];

const want = new THREE.Color();
const tint = new THREE.Color();
const tmpPos = new THREE.Vector3();
const tmpCam = new THREE.Vector3();

function CameraRig({ target, homeNonce }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls);
  const goal = useRef({ pos: new THREE.Vector3(0, 0, OVERVIEW_DIST), look: new THREE.Vector3(), active: false });

  useEffect(() => {
    const g = goal.current;
    if (target) {
      g.look.copy(target);
      g.pos.copy(target).addScaledVector(target.clone().normalize(), VESSEL_DIST);
    } else {
      const dir = camera.position.lengthSq() > 0 ? camera.position.clone().normalize() : new THREE.Vector3(0, 0, 1);
      g.look.set(0, 0, 0);
      g.pos.copy(dir).multiplyScalar(OVERVIEW_DIST);
    }
    g.active = true;
  }, [target, camera]);

  // "Reset view": straight back to the front-on overview, whatever angle the user left it at.
  useEffect(() => {
    if (!homeNonce) return;
    const g = goal.current;
    g.look.set(0, 0, 0);
    g.pos.set(0, 0, OVERVIEW_DIST);
    g.active = true;
  }, [homeNonce]);

  useEffect(() => {
    if (!controls) return undefined;
    const stop = () => { goal.current.active = false; };
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, [controls]);

  useFrame((_, dt) => {
    const g = goal.current;
    if (!controls || !g.active) return;
    const k = 1 - Math.exp(-dt * 3.2);
    camera.position.lerp(g.pos, k);
    controls.target.lerp(g.look, k);
    controls.update();
    if (camera.position.distanceTo(g.pos) < 0.01) g.active = false;
  });
  return null;
}

function Label({ code, result, position, active, onSelect }) {
  const group = useRef();
  const box = useRef();

  // Fade the label out when its vessel is on the far side of the heart.
  useFrame(({ camera }) => {
    if (!group.current || !box.current) return;
    group.current.getWorldPosition(tmpPos).normalize();
    tmpCam.copy(camera.position).normalize();
    const o = THREE.MathUtils.smoothstep(tmpPos.dot(tmpCam), -0.05, 0.4);
    box.current.style.opacity = o.toFixed(2);
    box.current.style.pointerEvents = o > 0.5 ? 'auto' : 'none';
  });

  return (
    <group ref={group} position={position}>
      <Html center zIndexRange={[20, 0]}>
        <div ref={box} className="vlabel">
          <button type="button" className={active ? 'is-active' : ''} onClick={() => onSelect(code)}
            aria-label={`${TARGETS[code].name}: ${formatProb(result.probability)}, ${statusLabel(result.status)}`}>
            <span className="dot" style={{ background: riskColour(result.colour_score) }} />
            <span className="code">{TARGETS[code].short}</span>
            <span className="val num">{formatProb(result.probability)}</span>
          </button>
        </div>
      </Html>
    </group>
  );
}

function Heart({ results, selected, onSelect, hovered, onHover, rotation, visible, dim, homeNonce }) {
  const gltf = useGLTF(MODEL);

  const model = useMemo(() => {
    const scene = gltf.scene.clone(true);
    const parts = {};
    scene.traverse((o) => {
      if (!o.isMesh) return;
      o.material = new THREE.MeshStandardMaterial({
        color: NEUTRAL, roughness: 0.55, metalness: 0.02, vertexColors: false, transparent: true,
        emissive: new THREE.Color(0, 0, 0), emissiveIntensity: 0,
      });
      parts[o.name] = o;
    });
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(parts.Heart_body ?? scene);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const scale = FIT / Math.max(size.x, size.y, size.z);
    const centres = {};
    VESSELS.forEach((v) => {
      if (parts[v]) centres[v] = new THREE.Box3().setFromObject(parts[v]).getCenter(new THREE.Vector3()).sub(centre);
    });
    return { scene, parts, centre, scale, centres };
  }, [gltf.scene]);

  const radians = useMemo(() => rotation.map((d) => THREE.MathUtils.degToRad(d)), [rotation]);

  const focusPoint = useMemo(() => {
    const c = selected && model.centres[selected];
    if (!c) return null;
    return c.clone().multiplyScalar(model.scale).applyEuler(new THREE.Euler(...radians));
  }, [selected, model, radians]);

  const labelAt = useMemo(() => {
    const out = {};
    Object.entries(model.centres).forEach(([k, c]) => {
      out[k] = c.clone().add(c.clone().normalize().multiplyScalar(0.18 / model.scale));
    });
    return out;
  }, [model]);

  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * 6);
    const cad = results?.CAD;
    Object.entries(model.parts).forEach(([name, mesh]) => {
      const m = mesh.material;
      if (VESSELS.includes(name)) {
        const r = results?.[name];
        const hidden = visible?.[name] === false;
        const dimmed = dim && selected && selected !== name;
        want.set(r && !hidden && !dimmed ? riskColour(r.colour_score) : NEUTRAL);
        const lit = hidden || dimmed ? 0 : selected === name ? 0.45 : hovered === name ? 0.25 : r ? 0.08 : 0;
        m.emissiveIntensity += (lit - m.emissiveIntensity) * k;
        const op = hidden ? 0.14 : 1;
        m.opacity += (op - m.opacity) * k;
        m.depthWrite = op > 0.5;
        m.emissive.copy(m.color);
      } else {
        want.set(TISSUE[name] ?? NEUTRAL);
        if (name === 'Heart_body' && cad) want.lerp(tint.set(riskColour(cad.colour_score)), 0.16);
      }
      m.color.lerp(want, k);
    });
  });

  const isVessel = (e) => VESSELS.includes(e.object.name) && visible?.[e.object.name] !== false;

  return (
    <>
      <group rotation={radians} scale={model.scale}>
        <group position={model.centre.clone().multiplyScalar(-1)}>
          <primitive
            object={model.scene}
            onPointerOver={(e) => { if (isVessel(e)) { e.stopPropagation(); onHover(e.object.name); document.body.style.cursor = 'pointer'; } }}
            onPointerOut={(e) => { if (isVessel(e)) { onHover(null); document.body.style.cursor = ''; } }}
            onClick={(e) => { e.stopPropagation(); onSelect(isVessel(e) ? e.object.name : null); }}
          />
        </group>
        {results && VESSELS.map((v) => model.centres[v] && results[v] && visible?.[v] !== false && (
          <Label key={v} code={v} result={results[v]} position={labelAt[v]} active={selected === v} onSelect={onSelect} />
        ))}
      </group>
      <CameraRig target={focusPoint} homeNonce={homeNonce} />
    </>
  );
}

export default function HeartStage({ results = null, selected = null, onSelect = () => {}, rotation = DEFAULT_ROTATION, visible = null, dim = true }) {
  const [hovered, setHovered] = useState(null);
  const [homeNonce, setHomeNonce] = useState(0);
  const reset = () => { onSelect(null); setHomeNonce((n) => n + 1); };
  return (
    <div className="stage">
      <div className="stage-canvas" role="img" aria-label="Interactive 3D heart. Select a coronary vessel to see its result.">
      <Canvas camera={{ position: [0, 0, OVERVIEW_DIST], fov: 34, near: 0.1, far: 60 }} dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }} onPointerMissed={() => onSelect(null)}>
        <ambientLight intensity={0.4} />
        <hemisphereLight args={['#ffffff', '#41546a', 0.8]} />
        <directionalLight position={[4, 5, 6]} intensity={2.2} />
        <directionalLight position={[-5, -2, -4]} intensity={0.8} color="#9bbcff" />
        <Suspense fallback={<Html center><span className="stage-loading">Loading heart model</span></Html>}>
          <Heart results={results} selected={selected} onSelect={onSelect} hovered={hovered} onHover={setHovered} rotation={rotation} visible={visible} dim={dim} homeNonce={homeNonce} />
        </Suspense>
        <OrbitControls makeDefault enablePan={false} enableDamping dampingFactor={0.08}
          minDistance={1.6} maxDistance={11} autoRotate={!selected} autoRotateSpeed={0.5} />
      </Canvas>
      </div>
      <small className="stage-credit">Anatomy: BodyParts3D, &copy; DBCLS, CC BY-SA 2.1 JP</small>
        <button type="button" className="stage-btn" onClick={reset} title="Back to the front view and clear the selection" aria-label="Reset the heart view">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
          Reset view
        </button>
      </div>
  );
}

useGLTF.preload(MODEL);
