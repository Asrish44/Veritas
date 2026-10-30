"use client";

import { useEffect, useRef } from "react";
import { AdditiveBlending, Timer, WebGLRenderer, Scene, FogExp2, PerspectiveCamera, Group, Vector3, Color, BufferGeometry, BufferAttribute, ShaderMaterial, Points, Float32BufferAttribute, LineBasicMaterial, LineSegments, PointsMaterial, CanvasTexture } from "three";

/**
 * EvidenceConstellation — the landing hero's live 3D background.
 *
 * A slowly rotating sphere of glowing "claim" nodes connected by evidence
 * links, with bright verification pulses that travel along the edges.
 * Reacts to the pointer with a soft parallax; pauses when off-screen or
 * when the tab is hidden. Pure three.js — no keys, no network, fully local.
 */

const PALETTE = {
  supported: [0x34d399, 0x10b981, 0x6ee7b7], // emerald
  neutral: [0xe2e8f0, 0x94a3b8], // slate white
  unresolved: 0xfbbf24, // amber
  contradicted: 0xf87171, // red
};

function softDotTexture(size = 64): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.85)");
  g.addColorStop(0.6, "rgba(255,255,255,0.18)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function pickColor(): Color {
  const r = Math.random();
  if (r < 0.72) return new Color(PALETTE.supported[(Math.random() * PALETTE.supported.length) | 0]);
  if (r < 0.88) return new Color(PALETTE.neutral[(Math.random() * PALETTE.neutral.length) | 0]);
  if (r < 0.965) return new Color(PALETTE.unresolved);
  return new Color(PALETTE.contradicted);
}

interface Pulse {
  a: Vector3;
  b: Vector3;
  t: number;
  speed: number;
}

export function EvidenceConstellation({ className }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      return; // no WebGL — the static gradient background still carries the design
    }

    const scene = new Scene();
    scene.fog = new FogExp2(0x020617, 0.075);

    const camera = new PerspectiveCamera(55, 1, 0.1, 100);
    camera.position.set(0, 0.1, 7.4);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    host.appendChild(renderer.domElement);

    const disposables: Array<{ dispose: () => void }> = [];
    const dot = softDotTexture();
    disposables.push(dot);

    const world = new Group();
    scene.add(world);

    // soft emerald core glow behind the constellation
    const glowMat = new PointsMaterial({
      size: 11,
      map: dot,
      color: 0x065f46,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: AdditiveBlending,
      sizeAttenuation: true,
    });
    disposables.push(glowMat);
    const glowGeo = new BufferGeometry();
    glowGeo.setAttribute("position", new Float32BufferAttribute([0, 0, 0], 3));
    disposables.push(glowGeo);
    world.add(new Points(glowGeo, glowMat));

    // ---------- claim nodes ----------
    const NODES = 170;
    const positions = new Float32Array(NODES * 3);
    const colors = new Float32Array(NODES * 3);
    const sizes = new Float32Array(NODES);
    const nodeVecs: Vector3[] = [];

    for (let i = 0; i < NODES; i++) {
      const shell = i < NODES * 0.82;
      const v = new Vector3(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
      );
      if (v.lengthSq() < 1e-4) v.set(0.1, 0.1, 0.1);
      v.normalize();
      const radius = shell ? 2.35 + Math.random() * 1.15 : 0.9 + Math.random() * 1.3;
      v.multiplyScalar(radius);
      nodeVecs.push(v);
      positions[i * 3] = v.x;
      positions[i * 3 + 1] = v.y;
      positions[i * 3 + 2] = v.z;
      const c = pickColor();
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
      sizes[i] = shell ? 0.065 + Math.random() * 0.12 : 0.035 + Math.random() * 0.05;
    }

    const nodeGeo = new BufferGeometry();
    nodeGeo.setAttribute("position", new BufferAttribute(positions, 3));
    nodeGeo.setAttribute("color", new BufferAttribute(colors, 3));
    nodeGeo.setAttribute("aSize", new BufferAttribute(sizes, 1));
    disposables.push(nodeGeo);

    const nodeMat = new ShaderMaterial({
      uniforms: { uTex: { value: dot } },
      vertexShader: /* glsl */ `
        attribute float aSize;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * 320.0 / -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex;
        varying vec3 vColor;
        void main() {
          vec4 tex = texture2D(uTex, gl_PointCoord);
          gl_FragColor = vec4(vColor, 1.0) * tex;
        }
      `,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    disposables.push(nodeMat);
    world.add(new Points(nodeGeo, nodeMat));

    // ---------- evidence links (2 nearest neighbours) ----------
    const edgePts: number[] = [];
    const edgePairs: Array<[number, number]> = [];
    for (let i = 0; i < NODES; i++) {
      const dists: Array<{ j: number; d: number }> = [];
      for (let j = 0; j < NODES; j++) {
        if (i === j) continue;
        dists.push({ j, d: nodeVecs[i].distanceTo(nodeVecs[j]) });
      }
      dists.sort((a, b) => a.d - b.d);
      for (const { j, d } of dists.slice(0, 2)) {
        if (d > 1.75) continue;
        const key = i < j ? [i, j] : [j, i];
        if (edgePairs.some(([x, y]) => x === key[0] && y === key[1])) continue;
        edgePairs.push([key[0], key[1]]);
        edgePts.push(nodeVecs[i].x, nodeVecs[i].y, nodeVecs[i].z, nodeVecs[j].x, nodeVecs[j].y, nodeVecs[j].z);
      }
    }

    const linkGeo = new BufferGeometry();
    linkGeo.setAttribute("position", new Float32BufferAttribute(edgePts, 3));
    disposables.push(linkGeo);
    const linkMat = new LineBasicMaterial({
      color: 0x34d399,
      transparent: true,
      opacity: 0.17,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    disposables.push(linkMat);
    world.add(new LineSegments(linkGeo, linkMat));

    // ---------- verification pulses travelling along links ----------
    const PULSES = 16;
    const pulsePos = new Float32Array(PULSES * 3);
    const pulses: Pulse[] = [];
    for (let k = 0; k < PULSES; k++) {
      const [i, j] = edgePairs[(Math.random() * edgePairs.length) | 0] ?? [0, 1 % NODES];
      pulses.push({
        a: nodeVecs[i],
        b: nodeVecs[j],
        t: Math.random(),
        speed: 0.12 + Math.random() * 0.3,
      });
    }
    const pulseGeo = new BufferGeometry();
    pulseGeo.setAttribute("position", new BufferAttribute(pulsePos, 3));
    disposables.push(pulseGeo);
    const pulseMat = new PointsMaterial({
      size: 0.16,
      map: dot,
      color: 0xa7f3d0,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      sizeAttenuation: true,
    });
    disposables.push(pulseMat);
    world.add(new Points(pulseGeo, pulseMat));

    // ---------- ambient dust ----------
    const DUST = 320;
    const dustPos = new Float32Array(DUST * 3);
    for (let i = 0; i < DUST; i++) {
      const v = new Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
      v.multiplyScalar(3.8 + Math.random() * 6.5);
      dustPos[i * 3] = v.x;
      dustPos[i * 3 + 1] = v.y * 0.7;
      dustPos[i * 3 + 2] = v.z;
    }
    const dustGeo = new BufferGeometry();
    dustGeo.setAttribute("position", new BufferAttribute(dustPos, 3));
    disposables.push(dustGeo);
    const dustMat = new PointsMaterial({
      size: 0.035,
      map: dot,
      color: 0x64748b,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: AdditiveBlending,
      sizeAttenuation: true,
    });
    disposables.push(dustMat);
    const dust = new Points(dustGeo, dustMat);
    scene.add(dust);

    // ---------- pointer parallax ----------
    const target = { x: 0, y: 0 };
    const onPointer = (e: PointerEvent) => {
      target.x = (e.clientX / window.innerWidth - 0.5) * 2;
      target.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    // ---------- sizing ----------
    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    // ---------- render loop (pauses off-screen / hidden tab) ----------
    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    }, { threshold: 0.02 });
    io.observe(host);

    const timer = new Timer();
    let raf = 0;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      timer.update();
      const dt = Math.min(timer.getDelta(), 0.05);
      if (!visible || document.hidden) return;

      world.rotation.y += dt * 0.07;
      dust.rotation.y -= dt * 0.018;

      // advance pulses along their edges
      for (let k = 0; k < PULSES; k++) {
        const p = pulses[k];
        p.t += dt * p.speed;
        if (p.t >= 1) {
          p.t = 0;
          const [i, j] = edgePairs[(Math.random() * edgePairs.length) | 0] ?? [0, 1 % NODES];
          p.a = nodeVecs[i];
          p.b = nodeVecs[j];
          p.speed = 0.12 + Math.random() * 0.3;
        }
        pulsePos[k * 3] = p.a.x + (p.b.x - p.a.x) * p.t;
        pulsePos[k * 3 + 1] = p.a.y + (p.b.y - p.a.y) * p.t;
        pulsePos[k * 3 + 2] = p.a.z + (p.b.z - p.a.z) * p.t;
      }
      pulseGeo.attributes.position.needsUpdate = true;

      // gentle parallax toward the pointer
      camera.position.x += (target.x * 1.15 - camera.position.x) * 0.035;
      camera.position.y += (-target.y * 0.75 + 0.1 - camera.position.y) * 0.035;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onPointer);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={hostRef} className={className} aria-hidden="true" />;
}
