'use client';

import { cn } from '@kortix/ui';
import { supportsWebGL2 } from '@kortix/ui/shader-safe';
import { useEffect, useRef, useState } from 'react';
import type * as Three from 'three';

import { HOOP_PALETTE } from './hoop-palette';
import { hoopStep, type HoopState } from './hula-hoop-physics';

/** Hoop radius and tube radius, in world units. */
const RADIUS = 1;
const TUBE = 0.075;
/** How far the hoop's centre orbits the axis: the waist it swings around. */
const ORBIT = 0.2;

/** The 8×8 Bayer threshold, the same matrix the hero's DitherField uses. */
const BAYER = /* glsl */ `
  float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
  float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
  float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }
`;

/**
 * The lit tape on an ordered-dither grid, in the tape's own colours. Each
 * colour gets three steps: shade, the colour itself and a glossy highlight; the
 * dark side thins out to empty cells so the page shows through.
 */
const DITHER_OUT = /* glsl */ `
  {
    vec3 tape = sRGBTransferOETF(vec4(diffuseColor.rgb, 1.0)).rgb;
    float base = max(dot(tape, vec3(0.299, 0.587, 0.114)), 0.08);
    float light = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114)) / base;
    float threshold = bayer8(gl_FragCoord.xy);
    if (step(threshold, light * 1.4 + 0.12) < 0.5) discard;
    vec3 colour = tape * mix(0.5, 1.0, step(threshold, light - 0.3));
    colour = mix(colour, vec3(1.0), 0.7 * step(threshold, light - 1.15));
    gl_FragColor = vec4(colour, 1.0);
  }
`;

/** The tape: diagonal bands in the four hoop colours across one tile, so it winds round the tube as a spiral. */
function tapeTexture(THREE: typeof Three): Three.CanvasTexture {
  const band = 16;
  const size = band * HOOP_PALETTE.length;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;
  // Each band runs corner to corner; drawing it three tiles wide keeps the wrap seamless.
  for (let i = -HOOP_PALETTE.length; i < HOOP_PALETTE.length * 2; i += 1) {
    context.fillStyle = HOOP_PALETTE[((i % HOOP_PALETTE.length) + HOOP_PALETTE.length) % HOOP_PALETTE.length]!;
    context.beginPath();
    context.moveTo(i * band, size);
    context.lineTo((i + 1) * band, size);
    context.lineTo((i + 1) * band + size, 0);
    context.lineTo(i * band + size, 0);
    context.closePath();
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 1);
  return texture;
}

type Scene = {
  renderer: Three.WebGLRenderer;
  scene: Three.Scene;
  camera: Three.PerspectiveCamera;
  orbit: Three.Group;
  tilt: Three.Group;
  hoop: Three.Mesh;
  dispose: () => void;
};

/** Builds the renderer and the hoop. */
function buildScene(THREE: typeof Three, canvas: HTMLCanvasElement): Scene {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  // Half resolution: one dither cell is 2 CSS pixels, the hero field's grid.
  renderer.setPixelRatio(0.5);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 2.5, 4.6);
  camera.lookAt(0, -0.05, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x101010, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(-2.5, 4, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 1.1);
  rim.position.set(3, 1, -3);
  scene.add(rim);

  const texture = tapeTexture(THREE);
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.28, metalness: 0.05 });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = `${BAYER}\n${shader.fragmentShader}`.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>\n${DITHER_OUT}`,
    );
  };

  const geometry = new THREE.TorusGeometry(RADIUS, TUBE, 24, 220);
  const hoop = new THREE.Mesh(geometry, material);
  // Lay the ring flat: the torus is built in the XY plane.
  hoop.rotation.x = Math.PI / 2;
  const tilt = new THREE.Group();
  tilt.position.x = ORBIT;
  tilt.add(hoop);
  const orbit = new THREE.Group();
  orbit.add(tilt);
  scene.add(orbit);

  return {
    renderer,
    scene,
    camera,
    orbit,
    tilt,
    hoop,
    dispose: () => {
      geometry.dispose();
      material.dispose();
      texture.dispose();
      // No forceContextLoss(): the canvas hands back the same context on the next
      // mount (Strict Mode), and a lost one would leave the hoop blank. See DitherField.
      renderer.dispose();
    },
  };
}

/** Places the hoop for one state: the orbit phase, the tilt that speed flattens, the tape that rolls. */
function pose(view: Scene, state: HoopState) {
  view.orbit.rotation.y = -state.phase;
  view.tilt.rotation.z = state.tilt;
  // The tape rolls against the waist, a little slower than the orbit.
  view.hoop.rotation.z = state.phase * 0.82;
  view.tilt.position.y = Math.sin(state.phase * 2) * 0.03;
}

/** The speed an untouched hoop swings at, in radians per second. */
const IDLE = 1.5;

/**
 * A hula hoop taped in the four hoop colours, on a dither grid. It swings around
 * an invisible waist on its own; drag sideways (or press ← →) to throw it faster
 * or the other way, and the page's scroll feeds it too. Speed flattens the hoop,
 * as it does on a body. Three.js loads on the first intersection, the loop stops
 * off screen and in a hidden tab, and under prefers-reduced-motion the hoop rests
 * until it is thrown.
 */
export function HulaHoop({ className }: { className?: string }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    if (!frame || !canvas || !supportsWebGL2()) return;

    let cancelled = false;
    let view: Scene | null = null;
    let raf = 0;
    let loading = false;
    let intersecting = false;
    let visible = false;
    let last = 0;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // The entrance: the hoop arrives thrown, then settles to its idle swing.
    const state: HoopState = { phase: 0.6, speed: still ? 0 : 7, tilt: 0.16, idle: still ? 0 : IDLE };
    const drag = { active: false, id: -1, x: 0, t: 0, velocity: 0 };
    let impulse = 0;

    const draw = () => {
      if (!view) return;
      pose(view, state);
      view.renderer.render(view.scene, view.camera);
    };
    const tick = (now: number) => {
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0);
      last = now;
      // A held pointer that stops moving stops the hoop too, so a release after a pause is not a throw.
      if (drag.active && now - drag.t > 40) drag.velocity *= Math.exp(-dt / 0.1);
      hoopStep(state, dt, { drag: drag.active ? drag.velocity : null, impulse });
      impulse = 0;
      draw();
      // Under reduced motion the loop stops once the hoop comes to rest.
      const resting = state.idle === 0 && !drag.active && Math.abs(state.speed) < 0.01;
      if (visible && !resting) raf = requestAnimationFrame(tick);
      else {
        raf = 0;
        last = 0;
      }
    };
    const run = () => {
      cancelAnimationFrame(raf);
      last = 0;
      raf = visible && view ? requestAnimationFrame(tick) : 0;
    };
    const resize = () => {
      if (!view) return;
      const { clientWidth: width, clientHeight: height } = canvas;
      view.renderer.setSize(width, height, false);
      view.camera.aspect = width / Math.max(1, height);
      view.camera.updateProjectionMatrix();
      draw();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      drag.active = true;
      drag.id = event.pointerId;
      drag.x = event.clientX;
      drag.t = event.timeStamp;
      drag.velocity = state.speed;
      frame.setPointerCapture(event.pointerId);
      run();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!drag.active || event.pointerId !== drag.id) return;
      const box = frame.getBoundingClientRect();
      const dt = Math.max(1, event.timeStamp - drag.t) / 1000;
      // Pointer speed in hoop-widths per second becomes the swing speed.
      const target = ((event.clientX - drag.x) / box.width / dt) * 4.2;
      drag.velocity += (target - drag.velocity) * 0.5;
      drag.x = event.clientX;
      drag.t = event.timeStamp;
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!drag.active || event.pointerId !== drag.id) return;
      drag.active = false;
      // Released mid-flick: the hoop keeps the speed of the throw.
      state.speed = drag.velocity;
      run();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      impulse += event.key === 'ArrowRight' ? 2.4 : -2.4;
      run();
    };
    let scrollY = window.scrollY;
    const onScroll = () => {
      const delta = window.scrollY - scrollY;
      scrollY = window.scrollY;
      if (!visible || state.idle === 0) return;
      // Scrolling down winds the hoop one way, scrolling up the other.
      impulse += Math.sign(delta) * Math.min(Math.abs(delta), 80) * 0.02;
    };

    frame.addEventListener('pointerdown', onPointerDown);
    frame.addEventListener('pointermove', onPointerMove);
    frame.addEventListener('pointerup', onPointerUp);
    frame.addEventListener('pointercancel', onPointerUp);
    frame.addEventListener('lostpointercapture', onPointerUp);
    frame.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, { passive: true });
    const resizeObserver = new ResizeObserver(resize);
    const onVisibility = () => {
      visible = intersecting && document.visibilityState === 'visible';
      run();
    };
    // Three.js loads on the first intersection: a hoop hidden by the layout (display: none) never loads it.
    const load = () => {
      loading = true;
      import('three')
        .then((THREE) => {
          if (cancelled) return;
          view = buildScene(THREE, canvas);
          resizeObserver.observe(canvas);
          resize();
          setReady(true);
          run();
        })
        // A failed chunk or a refused WebGL context leaves the hoop inert and invisible.
        .catch(() => {
          view?.dispose();
          view = null;
        });
    };
    const viewObserver = new IntersectionObserver(([entry]) => {
      intersecting = entry.isIntersecting;
      if (intersecting && !loading) load();
      onVisibility();
    });
    viewObserver.observe(frame);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      frame.removeEventListener('pointerdown', onPointerDown);
      frame.removeEventListener('pointermove', onPointerMove);
      frame.removeEventListener('pointerup', onPointerUp);
      frame.removeEventListener('pointercancel', onPointerUp);
      frame.removeEventListener('lostpointercapture', onPointerUp);
      frame.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibility);
      resizeObserver.disconnect();
      viewObserver.disconnect();
      view?.dispose();
    };
  }, []);

  return (
    <div
      ref={frameRef}
      // Interactive only once the hoop has drawn: without WebGL it stays an empty, silent box.
      role={ready ? 'application' : undefined}
      aria-roledescription={ready ? 'hula hoop' : undefined}
      aria-hidden={!ready}
      tabIndex={ready ? 0 : -1}
      aria-label="Drag sideways, or press the left and right arrow keys, to spin the hoop."
      className={cn(
        'focus-visible:ring-ring aspect-[5/4] cursor-grab touch-pan-y rounded-xl outline-none select-none focus-visible:ring-2 active:cursor-grabbing',
        ready ? 'pointer-events-auto' : 'pointer-events-none',
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        className={cn('block size-full [image-rendering:pixelated] transition-opacity duration-(--duration-slower) ease-out', ready ? 'opacity-100' : 'opacity-0')}
      />
    </div>
  );
}
