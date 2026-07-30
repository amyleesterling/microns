/* Thirty seconds of cortex that actually happened.
 *
 * WHAT IS REAL HERE. 108 cells from the MICrONS functional data, each at its
 * own soma coordinate in the volume, each brightening on its own recorded
 * two photon calcium trace. The traces are 900 frames at 30 frames a second,
 * which is 30 seconds of a real recording, stored frame major as float32 and
 * clipped to 0 to 1 per cell when they were extracted. Nothing is generated,
 * looped from a shorter clip, or smoothed for looks. Pause it and the number
 * under the stage is the second of the recording you are looking at.
 *
 * WHAT A CALCIUM TRACE IS, AND IS NOT. It is a fluorescence measurement that
 * follows spiking, slowly. A bright cell here fired recently; it is not one
 * spike, and the rise and fall you see are the indicator's, not the membrane's.
 *
 * THE FIELDS ARE NOT LAYERS. The upstream schema comments call the three
 * imaging fields layer 2/3, layer 4 and layer 5, and the soma depths do not
 * support it: field 2 has a median depth of 470 µm, field 4 of 467, and
 * field 6 of 480, all inside one 408 to 524 µm slab. They are three imaging
 * fields recorded at the same depth, so this panel calls them that and gives
 * the depths, rather than repeating a label the data contradicts.
 *
 * SOMATA BY DEFAULT, ARBORS ON REQUEST. Each cell's soma is drawn at its own
 * measured coordinate, which is one draw call and 400 KB for all 108, and it
 * carries the entire measurement. The reconstructed arbors are real too and
 * they are here, Draco compressed from 118 MB to 13 MB, but they are 108 more
 * requests and about six million triangles, so a reader asks for them rather
 * than being charged for them on the way past.
 *
 * THE TWO LAYERS SWAP, THEY DO NOT STACK, AND HERE IS WHY. The manifest gives
 * two independent positions for each cell: a soma coordinate, and an arbor
 * mesh whose vertices are already baked in the swarm frame. For 55 of the 108
 * they agree, the soma sitting a median 33 µm from the nearest arbor vertex.
 * For 39 of them they disagree by more than 100 µm, out to 702 µm, which is
 * further than some of these cells are wide. Every `world` value is exactly
 * (somaNm - centroid) × 2.5e-6 with Y flipped, so the soma side is at least
 * self consistent, and the upstream swarm adds the meshes with no position of
 * its own, so the arbor side is being used as intended. One of the two is
 * stale for those 39, most likely the soma points against a later
 * segmentation, which is the same drift that left 9 of this page's 38 mesh ids
 * needing to be resolved forward.
 *
 * Both layers are individually sound: the mesh and the trace are keyed by the
 * same segment id, and the soma and the trace come from the same manifest row.
 * It is only drawing them together that puts a visible contradiction on
 * screen, 39 dots floating away from their own branches. So the button swaps
 * the layer rather than adding to it, and the caption says what was found.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import {
  REDUCED, makeRenderer, fitRenderer, makeLoop, whenNear,
  disposeTree, fmt,
} from "./holo3d.js";

/* the render's own ramp and its own normalisation, so a cell's colour here
   means the same depth it means in the picture at the top of the page */
const D_LO = 321, D_HI = 1074;
const STOPS = [[0, [0xFF, 0xC2, 0x4A]], [0.5, [0x8E, 0x46, 0xC0]],
               [1, [0x1D, 0x35, 0x8F]]];
function ramp(t) {
  t = Math.min(1, Math.max(0, t));
  for (let i = 0; i < STOPS.length - 1; i++) {
    const a = STOPS[i], b = STOPS[i + 1];
    if (t <= b[0]) {
      const u = (t - a[0]) / (b[0] - a[0]);
      return [
        (a[1][0] + (b[1][0] - a[1][0]) * u) / 255,
        (a[1][1] + (b[1][1] - a[1][1]) * u) / 255,
        (a[1][2] + (b[1][2] - a[1][2]) * u) / 255,
      ];
    }
  }
  return [0.114, 0.208, 0.561];
}

export function mountActivity(el) {
  const mount = el.querySelector("[data-mount]");
  const status = el.querySelector("[data-status]");
  const facts = el.querySelector("[data-facts]");
  const play = el.querySelector("[data-play]");
  const clockEl = el.querySelector("[data-clock]");
  const scrub = el.querySelector("[data-scrub]");
  if (!mount) return;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.01, 100);
  camera.position.set(1.7, 0.55, 2.0);
  const renderer = makeRenderer(mount);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.enablePan = false; controls.minDistance = 0.7; controls.maxDistance = 9;
  controls.autoRotate = !REDUCED; controls.autoRotateSpeed = 0.55;
  renderer.domElement.style.cursor = "grab";
  renderer.domElement.addEventListener("pointerdown", function () {
    controls.autoRotate = false;
  });

  let manifest = null, traces = null, mesh = null;
  let frame = 0, playing = true, acc = 0;
  const base = [];                      /* each cell's depth colour, unlit */
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  /* the optional arbor layer: one material per cell, so a cell's branches can
     brighten on the same trace value that drives its soma */
  let arbors = null, arborMats = null;

  const loop = makeLoop(el, function (dt) {
    controls.update();
    if (traces && playing) {
      acc += dt;
      const step = 1 / traces.fps;
      while (acc >= step) { acc -= step; frame = (frame + 1) % traces.frames; }
      paint();
      tellTime();
    }
    renderer.render(scene, camera);
  });

  /* One instanced mesh for all 108 somata. Per frame it writes 108 matrices
     and 108 colours, which is nothing, and it is one draw call rather than
     108. Brightness and size both carry the trace: brightness alone is hard
     to read against a dark field once a cell is small. */
  function paint() {
    if (!mesh || !traces) return;
    const row = frame * traces.cells;
    for (let i = 0; i < traces.cells; i++) {
      const a = traces.data[row + i];
      const p = manifest.cells[i].world;
      dummy.position.set(p[0], p[1], p[2]);
      dummy.scale.setScalar(0.016 + 0.030 * a);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const k = 0.20 + 0.80 * a;
      col.setRGB(base[i][0] * k, base[i][1] * k, base[i][2] * k);
      mesh.setColorAt(i, col);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    if (arborMats) {
      for (let i = 0; i < arborMats.length; i++) {
        const m = arborMats[i];
        if (!m) continue;
        const a = traces.data[row + i];
        /* the arbors sit low and lift with the cell, so a quiet cell is still
           visible as structure and a firing one is unmistakable */
        m.opacity = 0.055 + 0.5 * a * a;
      }
    }
  }

  function tellTime() {
    if (!traces) return;
    const s = frame / traces.fps;
    if (clockEl) {
      /* the unit opts out of the label's uppercase transform: an uppercase S
         is siemens, and this is seconds */
      clockEl.innerHTML = s.toFixed(1) + ' <span class="mhud-u">s</span> of ' +
        (traces.frames / traces.fps).toFixed(0);
    }
    if (scrub && document.activeElement !== scrub) scrub.value = String(frame);
  }

  if (play) {
    play.addEventListener("click", function () {
      playing = !playing;
      play.textContent = playing ? "Pause" : "Play";
      play.setAttribute("aria-pressed", String(!playing));
      loop.once();
    });
  }
  if (scrub) {
    scrub.addEventListener("input", function () {
      frame = Number(scrub.value) || 0;
      playing = false;
      if (play) {
        play.textContent = "Play";
        play.setAttribute("aria-pressed", "true");
      }
      paint(); tellTime(); loop.once();
    });
  }

  /* ---- the arbors, on request ---------------------------------------------
     108 files, about 115 KB each after Draco, decoded on a worker pool the
     loader manages. The button reports progress because 13 MB is long enough
     that a silent button reads as a broken one. */
  const arborBtn = el.querySelector("[data-arbors]");
  let arborState = "idle";
  if (arborBtn) {
    arborBtn.addEventListener("click", function () {
      if (arborState === "loading") return;
      if (arborState === "ready") {
        arbors.visible = !arbors.visible;
        /* the swap, not a stack. See the note at the top of this file. */
        if (mesh) mesh.visible = !arbors.visible;
        arborBtn.textContent = arbors.visible ? "Back to the somata" : "Show the arbors";
        arborBtn.setAttribute("aria-pressed", String(arbors.visible));
        loop.once();
        return;
      }
      arborState = "loading";
      arborBtn.disabled = true;

      const draco = new DRACOLoader();
      draco.setDecoderPath("vendor/three/addons/libs/draco/gltf/");
      const gl = new GLTFLoader();
      gl.setDRACOLoader(draco);

      arbors = new THREE.Group();
      arborMats = new Array(manifest.cells.length).fill(null);
      scene.add(arbors);
      let done = 0;

      manifest.cells.forEach(function (c, i) {
        gl.load("meshes/activity/" + c.segId + ".glb", function (gltf) {
          const mat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(base[i][0], base[i][1], base[i][2]),
            transparent: true, opacity: 0.06,
            blending: THREE.AdditiveBlending, depthWrite: false,
          });
          arborMats[i] = mat;
          gltf.scene.traverse(function (o) {
            if (o.isMesh) { o.material = mat; o.frustumCulled = false; }
          });
          /* vertices are already baked at the cell's position in the swarm
             frame, so this is added where it lands, not placed */
          arbors.add(gltf.scene);
          tick();
        }, null, tick);

        function tick() {
          done++;
          arborBtn.textContent = "Loading arbors " + done + " of " + manifest.cells.length;
          if (done < manifest.cells.length) return;
          arborState = "ready";
          arborBtn.disabled = false;
          arborBtn.textContent = "Back to the somata";
          arborBtn.setAttribute("aria-pressed", "true");
          if (mesh) mesh.visible = false;
          draco.dispose();
          paint(); loop.once();
        }
      });
    });
  }

  const ro = new ResizeObserver(function () {
    if (fitRenderer(renderer, camera, mount)) loop.once();
  });
  ro.observe(mount);

  const start = whenNear(el, function () {
    Promise.all([
      fetch("data/activity-manifest.json").then(function (r) { return r.json(); }),
      fetch("data/activity-traces.bin").then(function (r) { return r.arrayBuffer(); }),
    ]).then(function (res) {
      manifest = res[0];
      const buf = res[1], dv = new DataView(buf);
      /* header: u32 cells, u32 frames, f32 fps, then float32 frame major */
      const cells = dv.getUint32(0, true);
      const frames = dv.getUint32(4, true);
      const fps = dv.getFloat32(8, true);
      traces = {
        cells: cells, frames: frames, fps: fps,
        data: new Float32Array(buf, 12, cells * frames),
      };
      if (cells !== manifest.cells.length) {
        /* the two files have to agree or every cell is lit by another cell's
           trace, which would look completely convincing and be wrong */
        if (status) status.textContent = "The traces and the cell list disagree.";
        return;
      }

      const geom = new THREE.SphereGeometry(1, 12, 8);
      const mat = new THREE.MeshBasicMaterial({
        transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      mesh = new THREE.InstancedMesh(geom, mat, cells);
      mesh.frustumCulled = false;
      for (let i = 0; i < cells; i++) {
        base.push(ramp((manifest.cells[i].somaNm[1] / 1000 - D_LO) / (D_HI - D_LO)));
      }
      scene.add(mesh);

      if (scrub) { scrub.max = String(frames - 1); scrub.disabled = false; }
      if (status) status.remove();
      report();
      paint(); tellTime();
      fitRenderer(renderer, camera, mount);
      loop.run(); loop.once();
    }).catch(function () {
      if (status) status.textContent = "The activity data did not load.";
    });
  });

  function report() {
    if (!facts || !manifest) return;
    const row = function (k, v, n) {
      return '<div class="mviz-row"><span>' + k + "</span><b>" + v + "</b>" +
             (n ? '<em class="mviz-note">' + n + "</em>" : "") + "</div>";
    };
    const d = manifest.cells.map(function (c) { return c.somaNm[1] / 1000; })
      .sort(function (a, b) { return a - b; });
    const fields = {};
    for (const c of manifest.cells) fields[c.field] = (fields[c.field] || 0) + 1;
    const fkeys = Object.keys(fields).sort();

    facts.innerHTML =
      row("Cells", fmt(manifest.cells.length),
        "each one a real minnie65 segment, lit by its own trace") +
      row("Recording", (traces.frames / traces.fps).toFixed(0) + " s",
        fmt(traces.frames) + " frames at " + traces.fps + " a second") +
      row("Soma depth", fmt(d[0], 0) + " to " + fmt(d[d.length - 1], 0) + " µm",
        "median " + fmt(d[Math.floor(d.length / 2)], 0) +
        " µm below the pia, one slab rather than a column") +
      row("Imaging fields", fkeys.map(function (k) {
        return fields[k] + " in field " + k;
      }).join(", "), "three fields at the same depth, not three layers");
  }

  return { el: el, loop: loop, start: start, scene: scene, camera: camera,
    renderer: renderer,
    state: function () {
      return { frame: frame, playing: playing, traces: traces, manifest: manifest,
               mesh: mesh, base: base, arbors: arbors, arborMats: arborMats };
    },
    setFrame: function (f) { frame = f; paint(); tellTime(); },
    dispose: function () {
      loop.stop(); ro.disconnect(); controls.dispose();
      disposeTree(scene); renderer.dispose();
    } };
}
