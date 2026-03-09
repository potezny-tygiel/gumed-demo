/**
 * PS1-style WebGPU Medical Lab Background
 *
 * Renders a low-poly, vertex-jittered laboratory scene behind the UI.
 * Two figures: one at a microscope, one handling lab glassware.
 *
 * Falls back to a static CSS gradient if WebGPU is unavailable.
 */

"use strict";

// ─────────────────────────────────────────────────────────────────────────────
// WGSL shaders
// ─────────────────────────────────────────────────────────────────────────────

const SHADER_SRC = /* wgsl */`

struct Uniforms {
  mvp       : mat4x4<f32>,
  model     : mat4x4<f32>,
  time      : f32,
  snap_grid : f32,   // PS1 vertex snap resolution
  _pad0     : f32,
  _pad1     : f32,
  fog_color : vec4<f32>,
  light_dir : vec4<f32>,
};
@group(0) @binding(0) var<uniform> u : Uniforms;

struct VSOut {
  @builtin(position) pos   : vec4<f32>,
  @location(0)       color : vec3<f32>,
  @location(1)       fog   : f32,
};

@vertex
fn vs_main(
  @location(0) position : vec3<f32>,
  @location(1) normal   : vec3<f32>,
  @location(2) color    : vec3<f32>,
) -> VSOut {
  var world = u.model * vec4<f32>(position, 1.0);

  // PS1-style vertex snapping
  var clip = u.mvp * vec4<f32>(position, 1.0);
  var g = u.snap_grid;
  clip.x = floor(clip.x * g + 0.5) / g;
  clip.y = floor(clip.y * g + 0.5) / g;

  // Simple directional + ambient lighting
  var wn = normalize((u.model * vec4<f32>(normal, 0.0)).xyz);
  var ld = normalize(u.light_dir.xyz);
  var diff = max(dot(wn, ld), 0.0);
  var lit = color * (0.45 + 0.55 * diff);

  // Distance fog
  var depth = clip.z / clip.w;
  var fog_amount = clamp((depth - 0.3) / 0.55, 0.0, 1.0);
  fog_amount = fog_amount * fog_amount;

  var out : VSOut;
  out.pos   = clip;
  out.color = lit;
  out.fog   = fog_amount;
  return out;
}

@fragment
fn fs_main(inp : VSOut) -> @location(0) vec4<f32> {
  var c = mix(inp.color, u.fog_color.rgb, inp.fog);
  return vec4<f32>(c, 1.0);
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// Geometry builders — all low-poly, vertex-colored, no textures
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every push adds a triangle: 3 vertices × (pos3 + nrm3 + col3) = 27 floats.
 */

function pushQuad(verts, p0, p1, p2, p3, color) {
    const n = calcNormal(p0, p1, p2);
    pushTri(verts, p0, p1, p2, n, color);
    pushTri(verts, p0, p2, p3, n, color);
}

function pushTri(verts, a, b, c, n, col) {
    verts.push(...a, ...n, ...col, ...b, ...n, ...col, ...c, ...n, ...col);
}

function calcNormal(a, b, c) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
    ];
    const len = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]) || 1;
    return [n[0] / len, n[1] / len, n[2] / len];
}

/** Axis-aligned box at (cx,cy,cz) with half-extents (hx,hy,hz). */
function pushBox(v, cx, cy, cz, hx, hy, hz, col) {
    const [x0, x1] = [cx - hx, cx + hx];
    const [y0, y1] = [cy - hy, cy + hy];
    const [z0, z1] = [cz - hz, cz + hz];
    // Front
    pushQuad(v, [x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1], col);
    // Back
    pushQuad(v, [x1, y1, z0], [x0, y1, z0], [x0, y0, z0], [x1, y0, z0], col);
    // Top
    pushQuad(v, [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], col);
    // Bottom
    pushQuad(v, [x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0], col);
    // Right
    pushQuad(v, [x1, y1, z1], [x1, y1, z0], [x1, y0, z0], [x1, y0, z1], col);
    // Left
    pushQuad(v, [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x0, y0, z0], col);
}

/** Cylinder approximation (N-sided prism) along Y axis. */
function pushCylinder(v, cx, cy, cz, radius, height, segs, col) {
    const y0 = cy, y1 = cy + height;
    for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        const x0 = cx + Math.cos(a0) * radius;
        const z0 = cz + Math.sin(a0) * radius;
        const x1 = cx + Math.cos(a1) * radius;
        const z1 = cz + Math.sin(a1) * radius;
        // Side face
        pushQuad(v, [x0, y1, z0], [x1, y1, z1], [x1, y0, z1], [x0, y0, z0], col);
        // Top
        pushTri(v, [cx, y1, cz], [x0, y1, z0], [x1, y1, z1], calcNormal([cx, y1, cz], [x0, y1, z0], [x1, y1, z1]), col);
        // Bottom
        pushTri(v, [cx, y0, cz], [x1, y0, z1], [x0, y0, z0], calcNormal([cx, y0, cz], [x1, y0, z1], [x0, y0, z0]), col);
    }
}

// ── Scene construction ──────────────────────────────────────────────────

function buildScene() {
    const v = [];

    // Colors
    const floorCol = [0.25, 0.30, 0.28];
    const wallCol = [0.55, 0.58, 0.55];
    const wallColBack = [0.50, 0.54, 0.52];
    const ceilingCol = [0.62, 0.64, 0.62];
    const tableCol = [0.45, 0.36, 0.26];
    const tableLegCol = [0.35, 0.28, 0.20];
    const labCoatCol = [0.85, 0.88, 0.85];
    const skinCol = [0.82, 0.68, 0.55];
    const hairColA = [0.20, 0.14, 0.10];
    const hairColB = [0.55, 0.35, 0.18];
    const pantsCol = [0.22, 0.24, 0.35];
    const stoolCol = [0.40, 0.40, 0.42];
    const microBodyCol = [0.20, 0.20, 0.22];
    const microLensCol = [0.35, 0.50, 0.70];
    const glassCol = [0.55, 0.72, 0.78];
    const liquidCol = [0.30, 0.70, 0.45];
    const shelfCol = [0.48, 0.40, 0.30];
    const cabinetCol = [0.52, 0.48, 0.40];
    const screenCol = [0.15, 0.35, 0.20];
    const screenFrame = [0.28, 0.28, 0.30];
    const posterCol = [0.75, 0.78, 0.70];
    const posterAccent = [0.30, 0.55, 0.65];
    const tileAccent = [0.22, 0.27, 0.25];
    const lampCol = [0.80, 0.82, 0.75];
    const lampArmCol = [0.35, 0.35, 0.38];

    // ── Room ──────────────────────────────────────────────────────────────
    // Floor (with tile grid pattern)
    pushBox(v, 0, -0.02, 0, 5, 0.02, 5, floorCol);
    // Tile lines
    for (let i = -4; i <= 4; i++) {
        pushBox(v, i, 0.005, 0, 0.02, 0.005, 5, tileAccent);
        pushBox(v, 0, 0.005, i, 5, 0.005, 0.02, tileAccent);
    }
    // Back wall
    pushBox(v, 0, 2.5, -5, 5, 2.5, 0.1, wallColBack);
    // Left wall
    pushBox(v, -5, 2.5, 0, 0.1, 2.5, 5, wallCol);
    // Right wall
    pushBox(v, 5, 2.5, 0, 0.1, 2.5, 5, wallCol);
    // Ceiling
    pushBox(v, 0, 5.0, 0, 5, 0.05, 5, ceilingCol);

    // ── Ceiling light fixtures ────────────────────────────────────────────
    pushBox(v, 0, 4.90, 0, 1.0, 0.05, 0.15, lampCol);
    pushBox(v, 0, 4.90, -2.5, 0.8, 0.05, 0.15, lampCol);
    pushBox(v, 0, 4.90, 2.5, 0.8, 0.05, 0.15, lampCol);

    // ── Back wall window (fake, just a lighter panel) ─────────────────────
    pushBox(v, 2.0, 3.2, -4.88, 1.2, 0.8, 0.05, [0.60, 0.72, 0.80]);
    // Window frame
    pushBox(v, 2.0, 3.2, -4.86, 1.25, 0.03, 0.03, [0.35, 0.35, 0.38]);
    pushBox(v, 2.0, 3.2, -4.86, 0.03, 0.85, 0.03, [0.35, 0.35, 0.38]);
    pushBox(v, 2.0, 4.03, -4.86, 1.25, 0.03, 0.03, [0.35, 0.35, 0.38]);
    pushBox(v, 2.0, 2.37, -4.86, 1.25, 0.03, 0.03, [0.35, 0.35, 0.38]);
    pushBox(v, 0.78, 3.2, -4.86, 0.03, 0.85, 0.03, [0.35, 0.35, 0.38]);
    pushBox(v, 3.22, 3.2, -4.86, 0.03, 0.85, 0.03, [0.35, 0.35, 0.38]);

    // ── Poster on back wall ───────────────────────────────────────────────
    pushBox(v, -2.5, 3.0, -4.88, 0.6, 0.8, 0.02, posterCol);
    pushBox(v, -2.5, 3.3, -4.86, 0.4, 0.15, 0.01, posterAccent);
    pushBox(v, -2.5, 2.7, -4.86, 0.35, 0.08, 0.01, [0.50, 0.50, 0.48]);

    // ── TABLE 1 (microscope table — left side) ───────────────────────────
    const t1x = -2.0, t1z = -2.5;
    pushBox(v, t1x, 1.05, t1z, 1.0, 0.05, 0.5, tableCol); // top
    pushBox(v, t1x - 0.85, 0.5, t1z - 0.4, 0.06, 0.5, 0.06, tableLegCol);
    pushBox(v, t1x + 0.85, 0.5, t1z - 0.4, 0.06, 0.5, 0.06, tableLegCol);
    pushBox(v, t1x - 0.85, 0.5, t1z + 0.4, 0.06, 0.5, 0.06, tableLegCol);
    pushBox(v, t1x + 0.85, 0.5, t1z + 0.4, 0.06, 0.5, 0.06, tableLegCol);
    // Drawer
    pushBox(v, t1x + 0.5, 0.75, t1z, 0.45, 0.2, 0.45, [0.40, 0.33, 0.24]);
    pushBox(v, t1x + 0.5, 0.78, t1z + 0.46, 0.15, 0.03, 0.01, [0.55, 0.50, 0.40]);

    // ── MICROSCOPE on table 1 ─────────────────────────────────────────────
    const mx = t1x - 0.3, mz = t1z;
    // Base plate
    pushBox(v, mx, 1.15, mz, 0.18, 0.04, 0.12, microBodyCol);
    // Stage
    pushBox(v, mx, 1.23, mz, 0.12, 0.02, 0.12, [0.25, 0.25, 0.27]);
    // Arm (vertical)
    pushBox(v, mx, 1.55, mz - 0.08, 0.05, 0.35, 0.04, microBodyCol);
    // Head (angled forward)
    pushBox(v, mx, 1.85, mz + 0.02, 0.05, 0.10, 0.10, microBodyCol);
    // Eyepiece tubes
    pushCylinder(v, mx - 0.04, 1.90, mz + 0.02, 0.025, 0.15, 6, [0.30, 0.30, 0.32]);
    pushCylinder(v, mx + 0.04, 1.90, mz + 0.02, 0.025, 0.15, 6, [0.30, 0.30, 0.32]);
    // Objective lenses (small cylinders under stage)
    pushCylinder(v, mx, 1.12, mz, 0.020, 0.06, 5, microLensCol);
    // Focus knobs
    pushCylinder(v, mx + 0.08, 1.45, mz - 0.08, 0.03, 0.02, 6, [0.35, 0.35, 0.37]);
    pushCylinder(v, mx - 0.08, 1.45, mz - 0.08, 0.03, 0.02, 6, [0.35, 0.35, 0.37]);
    // Slide on stage
    pushBox(v, mx, 1.26, mz, 0.05, 0.005, 0.015, [0.70, 0.80, 0.85]);

    // ── Desk lamp on table 1 ──────────────────────────────────────────────
    pushCylinder(v, t1x + 0.6, 1.10, t1z - 0.3, 0.08, 0.03, 6, lampArmCol);
    pushBox(v, t1x + 0.6, 1.13, t1z - 0.3, 0.02, 0.25, 0.02, lampArmCol);
    pushBox(v, t1x + 0.6, 1.38, t1z - 0.22, 0.06, 0.04, 0.12, lampCol);

    // ── STOOL 1 (in front of microscope table) ────────────────────────────
    const s1x = t1x - 0.2, s1z = t1z + 1.2;
    pushCylinder(v, s1x, 0.65, s1z, 0.22, 0.05, 8, stoolCol);
    pushCylinder(v, s1x, 0.0, s1z, 0.04, 0.65, 6, [0.35, 0.35, 0.37]);
    // Stool ring footrest
    for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        pushBox(v, s1x + Math.cos(a) * 0.15, 0.25, s1z + Math.sin(a) * 0.15, 0.08, 0.015, 0.015, [0.35, 0.35, 0.37]);
    }

    // ── PERSON 1 — sitting at microscope, leaning forward ─────────────────
    const p1x = s1x, p1z = s1z;
    // Legs (sitting, slightly forward)
    pushBox(v, p1x - 0.12, 0.45, p1z - 0.15, 0.08, 0.25, 0.08, pantsCol);
    pushBox(v, p1x + 0.12, 0.45, p1z - 0.15, 0.08, 0.25, 0.08, pantsCol);
    // Lower legs dangling
    pushBox(v, p1x - 0.12, 0.15, p1z + 0.0, 0.07, 0.20, 0.07, pantsCol);
    pushBox(v, p1x + 0.12, 0.15, p1z + 0.0, 0.07, 0.20, 0.07, pantsCol);
    // Shoes
    pushBox(v, p1x - 0.12, 0.03, p1z + 0.05, 0.07, 0.04, 0.10, [0.18, 0.16, 0.15]);
    pushBox(v, p1x + 0.12, 0.03, p1z + 0.05, 0.07, 0.04, 0.10, [0.18, 0.16, 0.15]);
    // Torso (leaning forward toward microscope)
    pushBox(v, p1x, 0.95, p1z - 0.3, 0.18, 0.28, 0.12, labCoatCol);
    // Lab coat collar detail
    pushBox(v, p1x, 1.18, p1z - 0.20, 0.12, 0.03, 0.06, [0.78, 0.80, 0.78]);
    // Head (looking into microscope — tilted forward/down)
    pushBox(v, p1x, 1.38, p1z - 0.50, 0.12, 0.14, 0.12, skinCol);
    // Hair
    pushBox(v, p1x, 1.48, p1z - 0.53, 0.13, 0.08, 0.13, hairColA);
    // Arms reaching toward microscope
    pushBox(v, p1x - 0.25, 0.90, p1z - 0.55, 0.06, 0.18, 0.06, labCoatCol);
    pushBox(v, p1x + 0.25, 0.90, p1z - 0.55, 0.06, 0.18, 0.06, labCoatCol);
    // Hands on microscope knobs
    pushBox(v, p1x - 0.25, 0.95, p1z - 0.72, 0.05, 0.05, 0.06, skinCol);
    pushBox(v, p1x + 0.25, 0.95, p1z - 0.72, 0.05, 0.05, 0.06, skinCol);

    // ── TABLE 2 (lab glass table — right side) ────────────────────────────
    const t2x = 2.0, t2z = -2.0;
    pushBox(v, t2x, 1.05, t2z, 1.2, 0.05, 0.6, tableCol); // top
    pushBox(v, t2x - 1.05, 0.5, t2z - 0.5, 0.06, 0.5, 0.06, tableLegCol);
    pushBox(v, t2x + 1.05, 0.5, t2z - 0.5, 0.06, 0.5, 0.06, tableLegCol);
    pushBox(v, t2x - 1.05, 0.5, t2z + 0.5, 0.06, 0.5, 0.06, tableLegCol);
    pushBox(v, t2x + 1.05, 0.5, t2z + 0.5, 0.06, 0.5, 0.06, tableLegCol);

    // ── LAB GLASSWARE on table 2 ──────────────────────────────────────────
    // Beaker 1 (tall)
    pushCylinder(v, t2x - 0.5, 1.10, t2z - 0.15, 0.08, 0.22, 7, glassCol);
    pushCylinder(v, t2x - 0.5, 1.10, t2z - 0.15, 0.065, 0.12, 7, liquidCol);
    // Beaker 2 (short, wider)
    pushCylinder(v, t2x - 0.15, 1.10, t2z + 0.15, 0.10, 0.14, 7, glassCol);
    pushCylinder(v, t2x - 0.15, 1.10, t2z + 0.15, 0.08, 0.08, 7, [0.65, 0.35, 0.30]);
    // Erlenmeyer flask shape (tapered — approximate with stacked cylinders)
    pushCylinder(v, t2x + 0.3, 1.10, t2z - 0.20, 0.09, 0.06, 7, glassCol);
    pushCylinder(v, t2x + 0.3, 1.16, t2z - 0.20, 0.07, 0.06, 7, glassCol);
    pushCylinder(v, t2x + 0.3, 1.22, t2z - 0.20, 0.04, 0.06, 6, glassCol);
    pushCylinder(v, t2x + 0.3, 1.28, t2z - 0.20, 0.025, 0.06, 6, glassCol);
    pushCylinder(v, t2x + 0.3, 1.10, t2z - 0.20, 0.07, 0.10, 7, [0.45, 0.65, 0.80]);
    // Test tube rack
    pushBox(v, t2x + 0.7, 1.14, t2z, 0.15, 0.04, 0.08, [0.50, 0.42, 0.32]);
    // Test tubes (vertical cylinders)
    for (let i = 0; i < 5; i++) {
        const tx = t2x + 0.58 + i * 0.06;
        pushCylinder(v, tx, 1.18, t2z, 0.015, 0.16, 5, glassCol);
        const liq = i % 2 === 0 ? [0.30, 0.60, 0.75] : [0.70, 0.40, 0.50];
        pushCylinder(v, tx, 1.18, t2z, 0.012, 0.06 + i * 0.01, 5, liq);
    }
    // Petri dish
    pushCylinder(v, t2x - 0.7, 1.10, t2z + 0.20, 0.10, 0.02, 8, [0.75, 0.78, 0.80]);
    pushCylinder(v, t2x - 0.7, 1.10, t2z + 0.20, 0.09, 0.015, 8, [0.85, 0.80, 0.70]);

    // ── Bunsen burner ─────────────────────────────────────────────────────
    pushCylinder(v, t2x + 0.1, 1.10, t2z - 0.40, 0.05, 0.02, 6, [0.30, 0.30, 0.32]);
    pushCylinder(v, t2x + 0.1, 1.12, t2z - 0.40, 0.02, 0.14, 6, [0.35, 0.35, 0.38]);

    // ── PERSON 2 — standing at table 2, handling glassware ────────────────
    const p2x = t2x - 0.2, p2z = t2z + 1.1;
    // Legs (standing)
    pushBox(v, p2x - 0.10, 0.42, p2z, 0.08, 0.42, 0.08, pantsCol);
    pushBox(v, p2x + 0.10, 0.42, p2z, 0.08, 0.42, 0.08, pantsCol);
    // Shoes
    pushBox(v, p2x - 0.10, 0.03, p2z + 0.03, 0.08, 0.04, 0.11, [0.18, 0.16, 0.15]);
    pushBox(v, p2x + 0.10, 0.03, p2z + 0.03, 0.08, 0.04, 0.11, [0.18, 0.16, 0.15]);
    // Torso (upright, slight lean toward table)
    pushBox(v, p2x, 1.10, p2z - 0.08, 0.20, 0.30, 0.12, labCoatCol);
    // Lab coat pocket detail
    pushBox(v, p2x + 0.12, 0.95, p2z + 0.05, 0.06, 0.06, 0.01, [0.78, 0.80, 0.78]);
    // Lab coat lower part
    pushBox(v, p2x, 0.75, p2z - 0.03, 0.20, 0.12, 0.11, labCoatCol);
    // Head
    pushBox(v, p2x, 1.55, p2z - 0.05, 0.12, 0.14, 0.12, skinCol);
    // Hair — slightly longer
    pushBox(v, p2x, 1.65, p2z - 0.06, 0.13, 0.08, 0.14, hairColB);
    // Side hair
    pushBox(v, p2x - 0.12, 1.57, p2z - 0.05, 0.03, 0.10, 0.10, hairColB);
    pushBox(v, p2x + 0.12, 1.57, p2z - 0.05, 0.03, 0.10, 0.10, hairColB);
    // Left arm reaching to table (holding beaker)
    pushBox(v, p2x - 0.28, 1.05, p2z - 0.35, 0.06, 0.22, 0.06, labCoatCol);
    pushBox(v, p2x - 0.28, 1.02, p2z - 0.55, 0.05, 0.05, 0.06, skinCol); // hand
    // Right arm hovering over flask
    pushBox(v, p2x + 0.28, 1.10, p2z - 0.30, 0.06, 0.20, 0.06, labCoatCol);
    pushBox(v, p2x + 0.28, 1.08, p2z - 0.50, 0.05, 0.05, 0.06, skinCol); // hand
    // Safety goggles on head
    pushBox(v, p2x, 1.58, p2z + 0.08, 0.14, 0.03, 0.02, [0.40, 0.55, 0.65]);

    // ── Wall shelving (back wall) ─────────────────────────────────────────
    pushBox(v, 0, 2.8, -4.80, 2.0, 0.04, 0.25, shelfCol);
    pushBox(v, 0, 2.2, -4.80, 2.0, 0.04, 0.25, shelfCol);
    // Shelf brackets
    pushBox(v, -1.5, 2.50, -4.80, 0.03, 0.30, 0.20, [0.38, 0.32, 0.25]);
    pushBox(v, 1.5, 2.50, -4.80, 0.03, 0.30, 0.20, [0.38, 0.32, 0.25]);
    pushBox(v, -1.5, 2.00, -4.80, 0.03, 0.20, 0.20, [0.38, 0.32, 0.25]);
    pushBox(v, 1.5, 2.00, -4.80, 0.03, 0.20, 0.20, [0.38, 0.32, 0.25]);

    // Bottles on shelves
    pushCylinder(v, -0.8, 2.24, -4.70, 0.05, 0.18, 6, [0.30, 0.22, 0.18]);
    pushCylinder(v, -0.4, 2.24, -4.65, 0.06, 0.22, 6, [0.70, 0.72, 0.75]);
    pushCylinder(v, 0.0, 2.24, -4.70, 0.04, 0.15, 6, [0.50, 0.25, 0.25]);
    pushCylinder(v, 0.5, 2.24, -4.68, 0.05, 0.20, 6, [0.25, 0.45, 0.55]);
    pushCylinder(v, 1.0, 2.24, -4.70, 0.06, 0.16, 6, [0.60, 0.55, 0.30]);
    // Upper shelf bottles
    pushCylinder(v, -0.6, 2.84, -4.70, 0.05, 0.20, 6, [0.55, 0.55, 0.58]);
    pushCylinder(v, 0.2, 2.84, -4.68, 0.06, 0.24, 6, [0.35, 0.55, 0.35]);
    pushCylinder(v, 0.8, 2.84, -4.70, 0.04, 0.18, 6, [0.60, 0.40, 0.55]);

    // ── Cabinet (left wall) ───────────────────────────────────────────────
    pushBox(v, -4.80, 1.2, 1.0, 0.20, 1.2, 0.6, cabinetCol);
    // Cabinet doors
    pushBox(v, -4.59, 1.2, 0.70, 0.01, 1.0, 0.28, [0.48, 0.44, 0.36]);
    pushBox(v, -4.59, 1.2, 1.30, 0.01, 1.0, 0.28, [0.48, 0.44, 0.36]);
    // Door handles
    pushBox(v, -4.57, 1.2, 0.96, 0.01, 0.06, 0.02, [0.55, 0.50, 0.40]);
    pushBox(v, -4.57, 1.2, 1.04, 0.01, 0.06, 0.02, [0.55, 0.50, 0.40]);

    // ── Monitor/Screen on left wall ───────────────────────────────────────
    pushBox(v, -4.85, 2.8, -1.0, 0.05, 0.45, 0.60, screenFrame);
    pushBox(v, -4.82, 2.8, -1.0, 0.02, 0.38, 0.52, screenCol);
    // Data visualization blips on screen
    for (let i = 0; i < 6; i++) {
        pushBox(v, -4.80, 2.55 + i * 0.08, -1.25 + i * 0.07, 0.01, 0.02, 0.02, [0.30, 0.75, 0.40]);
    }

    // ── Sink area (right wall, far end) ───────────────────────────────────
    pushBox(v, 4.80, 1.05, -3.5, 0.20, 0.05, 0.5, [0.65, 0.65, 0.68]);
    pushBox(v, 4.80, 0.85, -3.5, 0.18, 0.15, 0.40, [0.60, 0.60, 0.63]);
    // Faucet
    pushCylinder(v, 4.75, 1.10, -3.5, 0.015, 0.20, 5, [0.55, 0.55, 0.58]);
    pushBox(v, 4.70, 1.30, -3.5, 0.08, 0.015, 0.015, [0.55, 0.55, 0.58]);

    // ── Waste bin ─────────────────────────────────────────────────────────
    pushCylinder(v, 3.8, 0.0, 1.5, 0.18, 0.45, 7, [0.40, 0.40, 0.42]);

    // ── Fire extinguisher on left wall ────────────────────────────────────
    pushCylinder(v, -4.82, 0.30, 3.5, 0.06, 0.35, 6, [0.75, 0.18, 0.15]);
    pushBox(v, -4.82, 0.65, 3.5, 0.04, 0.04, 0.04, [0.25, 0.25, 0.27]);

    return new Float32Array(v);
}

// ─────────────────────────────────────────────────────────────────────────────
// Math helpers
// ─────────────────────────────────────────────────────────────────────────────

function mat4Perspective(fovY, aspect, near, far) {
    const f = 1 / Math.tan(fovY / 2);
    const nf = 1 / (near - far);
    return new Float32Array([
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) * nf, -1,
        0, 0, 2 * far * near * nf, 0,
    ]);
}

function mat4LookAt(eye, center, up) {
    const z = normalize3(sub3(eye, center));
    const x = normalize3(cross3(up, z));
    const y = cross3(z, x);
    return new Float32Array([
        x[0], y[0], z[0], 0,
        x[1], y[1], z[1], 0,
        x[2], y[2], z[2], 0,
        -dot3(x, eye), -dot3(y, eye), -dot3(z, eye), 1,
    ]);
}

function mat4Multiply(a, b) {
    const o = new Float32Array(16);
    for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++) {
            let s = 0;
            for (let k = 0; k < 4; k++) s += a[i + k * 4] * b[k + j * 4];
            o[i + j * 4] = s;
        }
    return o;
}

function mat4Identity() {
    const m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
}

function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function normalize3(v) {
    const l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
}

// ─────────────────────────────────────────────────────────────────────────────
// WebGPU initialisation
// ─────────────────────────────────────────────────────────────────────────────

async function initLabScene() {
    // Feature-detect
    if (!navigator.gpu) {
        console.warn("WebGPU not supported — using CSS fallback background.");
        document.body.classList.add("no-webgpu");
        return;
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) { document.body.classList.add("no-webgpu"); return; }
    const device = await adapter.requestDevice();

    // Canvas setup
    const canvas = document.createElement("canvas");
    canvas.id = "lab-bg";
    document.body.prepend(canvas);

    const ctx = canvas.getContext("webgpu");
    const format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format, alphaMode: "opaque" });

    // Build geometry
    const vertexData = buildScene();
    const vertexCount = vertexData.length / 9; // 9 floats per vertex
    const vertexBuffer = device.createBuffer({
        size: vertexData.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(vertexBuffer, 0, vertexData);

    // Uniform buffer
    const uniformSize = 176; // 2×mat4(128) + 4 floats(16) + 2×vec4(32) = 176
    const uniformBuffer = device.createBuffer({
        size: uniformSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Shader
    const module = device.createShaderModule({ code: SHADER_SRC });

    // Pipeline
    const pipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: {
            module,
            entryPoint: "vs_main",
            buffers: [{
                arrayStride: 36, // 9 floats × 4 bytes
                attributes: [
                    { shaderLocation: 0, offset: 0, format: "float32x3" }, // pos
                    { shaderLocation: 1, offset: 12, format: "float32x3" }, // nrm
                    { shaderLocation: 2, offset: 24, format: "float32x3" }, // col
                ],
            }],
        },
        fragment: {
            module,
            entryPoint: "fs_main",
            targets: [{ format }],
        },
        primitive: {
            topology: "triangle-list",
            cullMode: "back",
        },
        depthStencil: {
            format: "depth24plus",
            depthWriteEnabled: true,
            depthCompare: "less",
        },
    });

    // Bind group
    const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });

    // Depth texture (recreated on resize)
    let depthTexture = null;

    function resize() {
        const dpr = Math.min(window.devicePixelRatio, 2); // cap for perf
        const w = Math.floor(canvas.clientWidth * dpr);
        const h = Math.floor(canvas.clientHeight * dpr);
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
            if (depthTexture) depthTexture.destroy();
            depthTexture = device.createTexture({
                size: [w, h],
                format: "depth24plus",
                usage: GPUTextureUsage.RENDER_ATTACHMENT,
            });
        }
    }

    // ── Fog color matches the CSS background ──────────────────────────────
    const fogR = 0.20, fogG = 0.22, fogB = 0.25;

    // ── Render loop ───────────────────────────────────────────────────────
    function frame(t) {
        resize();
        const secs = t / 1000;

        // Slow orbit camera
        const camRadius = 7.5;
        const camSpeed = 0.06;
        const camAngle = secs * camSpeed;
        const camX = Math.sin(camAngle) * camRadius;
        const camZ = Math.cos(camAngle) * camRadius;
        const camY = 2.8 + Math.sin(secs * 0.15) * 0.4;

        const aspect = canvas.width / canvas.height;
        const proj = mat4Perspective(Math.PI / 4, aspect, 0.1, 30);
        const view = mat4LookAt([camX, camY, camZ], [0, 1.2, -1.0], [0, 1, 0]);
        const model = mat4Identity();
        const mvp = mat4Multiply(proj, view);

        // Uniform data: 44 floats = 176 bytes
        const ub = new ArrayBuffer(176);
        const f = new Float32Array(ub);
        f.set(mvp, 0);        // mat4 mvp      [0..15]
        f.set(model, 16);     // mat4 model    [16..31]
        f[32] = secs;         // time
        f[33] = 120.0;        // snap_grid (lower = more PS1 jitter)
        f[34] = 0;            // _pad0
        f[35] = 0;            // _pad1
        f[36] = fogR;         // fog_color.r
        f[37] = fogG;         // fog_color.g
        f[38] = fogB;         // fog_color.b
        f[39] = 1.0;          // fog_color.a
        f[40] = 0.4;          // light_dir.x
        f[41] = 0.8;          // light_dir.y
        f[42] = 0.3;          // light_dir.z
        f[43] = 0.0;          // light_dir.w

        device.queue.writeBuffer(uniformBuffer, 0, ub, 0, 176);

        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: ctx.getCurrentTexture().createView(),
                clearValue: { r: fogR, g: fogG, b: fogB, a: 1 },
                loadOp: "clear",
                storeOp: "store",
            }],
            depthStencilAttachment: {
                view: depthTexture.createView(),
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store",
            },
        });

        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.setVertexBuffer(0, vertexBuffer);
        pass.draw(vertexCount);
        pass.end();

        device.queue.submit([encoder.finish()]);
        requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
}

// Start when DOM is ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLabScene);
} else {
    initLabScene();
}
