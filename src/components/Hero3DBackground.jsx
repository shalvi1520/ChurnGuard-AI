import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color } from 'three';

// A sparse "customer risk" node field framing the landing hero. Purely
// decorative and non-interactive — represents the product concept (many
// customers being watched, most healthy, a few drifting into risk) without
// being literal. See spec sections 10/11, and PROJECT_MEMORY.md.
//
// PERFORMANCE — this runs on the first screen every visitor sees, so it is
// deliberately built to be near-free:
//  - the whole field is ONE points draw call + ONE line-segments draw call.
//    (An earlier version used one <mesh> per node; at ~70 meshes that cost
//    ~44fps of scroll performance on a throttled CPU. Do not go back to
//    per-node meshes.)
//  - no lights, no postprocessing, no antialiasing, DPR pinned to 1
//  - the render loop is PAUSED whenever the hero scrolls out of view
//  - lazy-loaded by LandingPage, so it never blocks first paint
//  - skipped entirely on reduced-motion or small screens

const NODE_COUNT = 130;

const RISK_COLORS = [
  { color: '#9BD62F', weight: 0.5 },  // accent / healthy
  { color: '#4ADE80', weight: 0.26 }, // low risk
  { color: '#FBBF24', weight: 0.13 }, // medium risk
  { color: '#F97316', weight: 0.08 }, // high risk
  { color: '#EF4444', weight: 0.03 }, // critical risk
];

function pickColor(rand) {
  let r = rand;
  for (const bucket of RISK_COLORS) {
    if (r < bucket.weight) return bucket.color;
    r -= bucket.weight;
  }
  return RISK_COLORS[0].color;
}

// Soft circular sprite so points render as glowing dots rather than squares.
function createDotTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.75)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

// Builds the randomized layout once. Uses useState's lazy initializer (not
// useMemo) specifically because it involves Math.random() — that's the
// sanctioned React pattern for one-time non-deterministic setup during render.
function useNodeField() {
  const [field] = useState(() => {
    const nodes = [];
    for (let i = 0; i < NODE_COUNT; i++) {
      // Spread wide across the frame and biased toward the outer shell, so the
      // field populates the visible band around the headline instead of
      // bunching up in the middle (which the CSS mask then hides).
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = (0.5 + Math.sqrt(Math.random()) * 0.5) * 5.2;
      nodes.push([
        r * Math.sin(phi) * Math.cos(theta) * 1.95,
        r * Math.sin(phi) * Math.sin(theta) * 1.05,
        r * Math.cos(phi) * 0.7,
      ]);
    }

    const positions = new Float32Array(NODE_COUNT * 3);
    const colors = new Float32Array(NODE_COUNT * 3);
    const scratch = new Color();
    nodes.forEach((p, i) => {
      positions.set(p, i * 3);
      scratch.set(pickColor(Math.random()));
      colors.set([scratch.r, scratch.g, scratch.b], i * 3);
    });

    // Connect each node to its nearest neighbour within a distance cap, so the
    // field reads as a loose network rather than a random scatter.
    const edges = [];
    const maxEdges = Math.round(NODE_COUNT * 0.5);
    for (let i = 0; i < nodes.length && edges.length < maxEdges; i++) {
      let nearest = -1;
      let nearestDist = Infinity;
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const [ax, ay, az] = nodes[i];
        const [bx, by, bz] = nodes[j];
        const d = (ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2;
        if (d < nearestDist) {
          nearestDist = d;
          nearest = j;
        }
      }
      if (nearest !== -1 && nearestDist < 3.2) {
        edges.push([nodes[i], nodes[nearest]]);
      }
    }

    const edgePositions = new Float32Array(edges.length * 6);
    edges.forEach(([a, b], i) => edgePositions.set([...a, ...b], i * 6));

    return { positions, colors, edgePositions };
  });

  return field;
}

function NodeField() {
  const groupRef = useRef(null);
  const { positions, colors, edgePositions } = useNodeField();

  const dotTexture = useMemo(() => createDotTexture(), []);

  const pointsGeometry = useMemo(() => {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(positions, 3));
    geo.setAttribute('color', new BufferAttribute(colors, 3));
    return geo;
  }, [positions, colors]);

  const lineGeometry = useMemo(() => {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(edgePositions, 3));
    return geo;
  }, [edgePositions]);

  // Dispose GPU resources when the hero unmounts (navigating away from
  // the landing page) rather than leaking them for the session.
  useEffect(() => {
    return () => {
      pointsGeometry.dispose();
      lineGeometry.dispose();
      dotTexture.dispose();
    };
  }, [pointsGeometry, lineGeometry, dotTexture]);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.03;
      groupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.07) * 0.04;
    }
  });

  return (
    <group ref={groupRef}>
      <lineSegments geometry={lineGeometry}>
        <lineBasicMaterial color="#86BC25" transparent opacity={0.22} depthWrite={false} />
      </lineSegments>
      <points geometry={pointsGeometry}>
        <pointsMaterial
          size={0.26}
          map={dotTexture}
          vertexColors
          transparent
          opacity={0.95}
          sizeAttenuation
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </points>
    </group>
  );
}

// True when WebGL is unavailable or is being emulated in software (SwiftShader
// / llvmpipe — common when a GPU is blocklisted, in VMs, or over remote
// desktop). Software WebGL makes a full-screen canvas catastrophically slow,
// so we skip the effect rather than tank the whole page.
function hasUsableWebGL() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return false;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    return !/swiftshader|llvmpipe|software|basic render/i.test(renderer);
  } catch {
    return false;
  }
}

export default function Hero3DBackground() {
  const wrapperRef = useRef(null);
  const [visible, setVisible] = useState(true);
  // Set to false by the runtime guard below if the effect can't hold a
  // reasonable frame rate on this machine.
  const [performant, setPerformant] = useState(true);

  const [enabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    return !reducedMotion && window.innerWidth >= 640 && hasUsableWebGL();
  });

  // Runtime safety net: switch the effect off if this machine genuinely can't
  // keep up. A decorative background must never be the reason the page feels
  // sluggish. Sampling deliberately starts AFTER a settle delay — measuring
  // during initial load/parse would catch normal startup jank and disable the
  // effect on perfectly capable machines (it did, intermittently). The
  // threshold is likewise low enough to only catch genuinely broken cases.
  useEffect(() => {
    if (!enabled) return undefined;

    const SETTLE_MS = 1200;
    const SAMPLE_MS = 1200;
    const MIN_FPS = 20;

    let raf = 0;
    let frames = 0;
    let sampleTimer;

    const settleTimer = setTimeout(() => {
      if (document.hidden) return; // rAF is throttled in background tabs
      const start = performance.now();
      const tick = () => {
        frames++;
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      sampleTimer = setTimeout(() => {
        cancelAnimationFrame(raf);
        if (document.hidden) return;
        const fps = frames / ((performance.now() - start) / 1000);
        if (fps > 0 && fps < MIN_FPS) setPerformant(false);
      }, SAMPLE_MS);
    }, SETTLE_MS);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(settleTimer);
      clearTimeout(sampleTimer);
    };
  }, [enabled]);

  // Pause the render loop once the hero scrolls out of view — an always-on
  // WebGL loop behind the rest of the page is wasted battery and GPU time.
  useEffect(() => {
    if (!enabled) return undefined;
    const el = wrapperRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: '100px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled]);

  // The CSS gradient glows already carry the hero visually when this is
  // skipped, so there's nothing to fall back to.
  if (!enabled || !performant) return null;

  return (
    <div
      ref={wrapperRef}
      className="absolute inset-0 z-0 pointer-events-none"
      style={{
        // Fades the field out behind the headline/CTA column so nodes never sit
        // on top of readable text, while still letting them fill the rest of
        // the frame. `transparent` = hidden, `black` = visible: the CENTRE stop
        // must stay transparent or nodes will overlap the copy.
        maskImage:
          'radial-gradient(ellipse 46% 42% at 50% 40%, transparent 0%, transparent 46%, black 88%)',
        WebkitMaskImage:
          'radial-gradient(ellipse 46% 42% at 50% 40%, transparent 0%, transparent 46%, black 88%)',
      }}
      aria-hidden="true"
    >
      <Canvas
        camera={{ position: [0, 0, 6.5], fov: 45 }}
        dpr={0.85}
        frameloop={visible ? 'always' : 'never'}
        gl={{ antialias: false, alpha: true, powerPreference: 'low-power' }}
      >
        <NodeField />
      </Canvas>
    </div>
  );
}
