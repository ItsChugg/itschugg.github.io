'use strict';
// ── Constants ─────────────────────────────────────────────────────────────────
const PI   = Math.PI;
const PI2  = Math.PI / 2;
const SQRT2 = Math.sqrt(2);

// ── DOM ───────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── State ─────────────────────────────────────────────────────────────────────
let srcPixels = null, srcW = 0, srcH = 0;
let busy      = false;

// ── Bilinear sampler ──────────────────────────────────────────────────────────
// Returns [r, g, b, a] for a sub-pixel position in the source image.
function sample(sx, sy) {
  const x0 = Math.floor(sx),     y0 = Math.floor(sy);
  const x1 = Math.min(x0 + 1, srcW - 1);
  const y1 = Math.min(y0 + 1, srcH - 1);
  const fx  = sx - x0, fy = sy - y0;

  const px = (x, y) => { const i = (y * srcW + x) * 4; return i; };
  const r00 = srcPixels[px(x0,y0)],   g00 = srcPixels[px(x0,y0)+1],
        b00 = srcPixels[px(x0,y0)+2], a00 = srcPixels[px(x0,y0)+3];
  const r10 = srcPixels[px(x1,y0)],   g10 = srcPixels[px(x1,y0)+1],
        b10 = srcPixels[px(x1,y0)+2], a10 = srcPixels[px(x1,y0)+3];
  const r01 = srcPixels[px(x0,y1)],   g01 = srcPixels[px(x0,y1)+1],
        b01 = srcPixels[px(x0,y1)+2], a01 = srcPixels[px(x0,y1)+3];
  const r11 = srcPixels[px(x1,y1)],   g11 = srcPixels[px(x1,y1)+1],
        b11 = srcPixels[px(x1,y1)+2], a11 = srcPixels[px(x1,y1)+3];

  const L = (a, b, t) => a + t * (b - a);
  return [
    L(L(r00, r10, fx), L(r01, r11, fx), fy),
    L(L(g00, g10, fx), L(g01, g11, fx), fy),
    L(L(b00, b10, fx), L(b01, b11, fx), fy),
    L(L(a00, a10, fx), L(a01, a11, fx), fy),
  ];
}

// Wrap longitude into [-π, π]
function wrapLon(lon) {
  lon = lon % (2 * PI);
  if (lon >  PI) lon -= 2 * PI;
  if (lon < -PI) lon += 2 * PI;
  return lon;
}

// ── Projection definitions ────────────────────────────────────────────────────
// inverse(nx, ny, opts) → [latRad, lonRad] | null
//   nx, ny ∈ [-1, 1],  y-axis points UP (ny=1 = north, ny=-1 = south).
//   Returns null for pixels outside the valid region (e.g. outside an ellipse).
//
// aspect: output canvas width / height ratio.
// hasCenterControls: show lat/lon sliders in the panel.

const PROJ = {

  equirectangular: {
    label: 'Equirectangular',
    aspect: 2,
    hasCenterControls: false,
    inverse(nx, ny) {
      // Simple linear mapping — full globe visible
      return [ny * PI2, nx * PI];
    },
  },

  mercator: {
    label: 'Mercator',
    aspect: 1,
    hasCenterControls: false,
    inverse(nx, ny) {
      // ny spans the Mercator y range [-π, π] which clips at ≈ ±85.05°.
      // Inverse: lat = 2·atan(exp(y)) − π/2
      const lat = 2 * Math.atan(Math.exp(ny * PI)) - PI2;
      return [lat, nx * PI];
    },
  },

  mollweide: {
    label: 'Mollweide',
    aspect: 2,
    hasCenterControls: false,
    inverse(nx, ny) {
      // The valid region in normalised (nx,ny) coords is the unit disk:
      //   nx = cos(θ), ny = sin(θ) at the boundary (lon = ±π).
      // In pixel space (2:1 canvas) this appears as the classic Mollweide ellipse.
      if (nx * nx + ny * ny > 1 + 1e-9) return null;

      const theta = Math.asin(Math.max(-1, Math.min(1, ny)));
      // Solve 2θ + sin(2θ) = π·sin(lat) for lat:
      const lat = Math.asin((2 * theta + Math.sin(2 * theta)) / PI);
      const cosTheta = Math.cos(theta);
      // At exact poles cosTheta → 0; all longitudes map to the same pole.
      if (cosTheta < 1e-10) return [lat, 0];
      const lon = PI * nx / cosTheta;
      return [lat, Math.max(-PI, Math.min(PI, lon))];
    },
  },

  sinusoidal: {
    label: 'Sinusoidal',
    aspect: 2,
    hasCenterControls: false,
    inverse(nx, ny) {
      // Forward: x = lon·cos(lat)/π, y = lat/(π/2).
      // Valid region narrows toward the poles ("leaves" shape).
      const lat    = ny * PI2;
      const cosLat = Math.cos(lat);
      if (cosLat < 1e-9) return [lat, 0];
      const lon = nx * PI / cosLat;
      if (Math.abs(lon) > PI + 1e-9) return null;
      return [lat, Math.max(-PI, Math.min(PI, lon))];
    },
  },

  azimuthal: {
    label: 'Azimuthal Equidistant',
    aspect: 1,
    hasCenterControls: true,
    inverse(nx, ny, opts) {
      // The projection is a disk of radius π (= 180° = full globe from center).
      // nx/ny are scaled so the disk just fills the canvas.
      const lat0 = opts.lat * PI / 180;
      const lon0 = opts.lon * PI / 180;
      const px = nx * PI, py = ny * PI;
      const rho = Math.sqrt(px * px + py * py);
      if (rho > PI + 1e-9) return null;        // outside full-globe circle
      if (rho < 1e-10)     return [lat0, lon0]; // exactly at center

      const c    = rho; // angular distance from center equals rho for equidistant
      const sinC = Math.sin(c), cosC = Math.cos(c);
      const sinL = Math.sin(lat0), cosL = Math.cos(lat0);

      const lat = Math.asin(cosC * sinL + py * sinC * cosL / rho);
      const lon = lon0 + Math.atan2(px * sinC, rho * cosL * cosC - py * sinL * sinC);
      return [lat, wrapLon(lon)];
    },
  },

  orthographic: {
    label: 'Orthographic',
    aspect: 1,
    hasCenterControls: true,
    inverse(nx, ny, opts) {
      // One hemisphere visible — looks like a photograph of a globe.
      // Points outside the unit disk (ρ > 1) are on the far side.
      const rho = Math.sqrt(nx * nx + ny * ny);
      if (rho > 1 + 1e-9) return null;

      const lat0 = opts.lat * PI / 180;
      const lon0 = opts.lon * PI / 180;
      const r    = Math.min(rho, 1);
      const c    = Math.asin(r);
      const sinC = Math.sin(c), cosC = Math.cos(c);
      const sinL = Math.sin(lat0), cosL = Math.cos(lat0);

      if (rho < 1e-10) return [lat0, lon0];

      const lat = Math.asin(cosC * sinL + ny * sinC * cosL / rho);
      const lon = lon0 + Math.atan2(nx * sinC, rho * cosL * cosC - ny * sinL * sinC);
      return [lat, wrapLon(lon)];
    },
  },
};

// ── Center controls visibility ────────────────────────────────────────────────
function syncCenterControls() {
  const proj = PROJ[$('projection-select').value];
  $('center-controls').style.display = (proj && proj.hasCenterControls) ? 'flex' : 'none';
}

$('projection-select').addEventListener('change', syncCenterControls);
syncCenterControls();

$('center-lat').addEventListener('input', () => {
  $('center-lat-val').textContent = $('center-lat').value + '°';
});
$('center-lon').addEventListener('input', () => {
  $('center-lon-val').textContent = $('center-lon').value + '°';
});

// ── Output size slider ────────────────────────────────────────────────────────
$('size-slider').addEventListener('input', () => {
  $('size-val').textContent = $('size-slider').value + 'px';
});

// ── File upload ───────────────────────────────────────────────────────────────
$('upload-btn').addEventListener('click', () => $('file-input').click());

$('file-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    // Draw to an offscreen canvas to extract pixel data
    srcW = img.naturalWidth;
    srcH = img.naturalHeight;
    const offscreen = document.createElement('canvas');
    offscreen.width  = srcW;
    offscreen.height = srcH;
    offscreen.getContext('2d').drawImage(img, 0, 0);
    srcPixels = offscreen.getContext('2d').getImageData(0, 0, srcW, srcH).data;
    URL.revokeObjectURL(url);

    // Show filename
    const name = file.name;
    $('file-name').textContent = name.length > 22
      ? name.slice(0, 10) + '…' + name.slice(-9) : name;
    $('file-row').style.display    = 'flex';
    $('process-btn').disabled      = false;

    // Update placeholder text
    $('placeholder-text').textContent =
      `Source: ${srcW} × ${srcH}px — press Convert`;
  };
  img.onerror = () => { URL.revokeObjectURL(url); alert('Failed to load image.'); };
  img.src = url;
  e.target.value = '';
});

$('clear-btn').addEventListener('click', () => {
  srcPixels = null; srcW = 0; srcH = 0;
  $('file-row').style.display   = 'none';
  $('file-name').textContent    = '';
  $('process-btn').disabled     = true;
  $('download-btn').disabled    = true;
  $('output-canvas').style.display = 'none';
  $('proj-placeholder').style.display = 'flex';
  $('placeholder-text').textContent = 'Upload an equirectangular map to get started';
  $('file-input').value = '';
});

// ── Panel toggle ──────────────────────────────────────────────────────────────
$('panel-toggle').addEventListener('click', () => {
  $('panel').classList.toggle('collapsed');
});

// ── Main reprojection ─────────────────────────────────────────────────────────
$('process-btn').addEventListener('click', async () => {
  if (busy || !srcPixels) return;
  busy = true;
  $('process-btn').disabled  = true;
  $('download-btn').disabled = true;
  $('proc-progress').style.display = 'block';
  $('proc-bar').style.width  = '0%';
  $('proc-text').textContent = '0%';

  // Let the browser paint the progress bar before the heavy loop
  await new Promise(r => setTimeout(r, 16));

  const projKey = $('projection-select').value;
  const proj    = PROJ[projKey];
  const opts    = {
    lat: parseFloat($('center-lat').value),
    lon: parseFloat($('center-lon').value),
  };

  const outW = parseInt($('size-slider').value);
  const outH = Math.round(outW / proj.aspect);

  const canvas  = $('output-canvas');
  canvas.width  = outW;
  canvas.height = outH;
  const ctx     = canvas.getContext('2d');
  const imgData = ctx.createImageData(outW, outH);
  const data    = imgData.data;

  const CHUNK = 24; // rows per chunk (yield + progress update between)

  for (let chunkStart = 0; chunkStart < outH; chunkStart += CHUNK) {
    const chunkEnd = Math.min(chunkStart + CHUNK, outH);

    for (let py = chunkStart; py < chunkEnd; py++) {
      // ny: 1 at top (north), -1 at bottom (south)
      const ny = 1 - (py / outH) * 2;

      for (let px = 0; px < outW; px++) {
        // nx: -1 at left (west), 1 at right (east)
        const nx = (px / outW) * 2 - 1;

        const result = proj.inverse(nx, ny, opts);
        if (!result) continue; // outside valid region — leave transparent

        let [lat, lon] = result;
        // Clamp to safe ranges
        lat = Math.max(-PI2, Math.min(PI2, lat));
        lon = wrapLon(lon);

        // Sample from equirectangular source
        const u  = (lon + PI) / (2 * PI);
        const v  = (PI2 - lat) / PI;
        const sx = u * (srcW - 1);
        const sy = v * (srcH - 1);

        const [r, g, b, a] = sample(sx, sy);
        const di = (py * outW + px) * 4;
        data[di]     = r;
        data[di + 1] = g;
        data[di + 2] = b;
        data[di + 3] = a;
      }
    }

    // Update progress and yield to the browser
    const pct = Math.round(chunkEnd / outH * 100);
    $('proc-bar').style.width  = pct + '%';
    $('proc-text').textContent = pct + '%';
    await new Promise(r => setTimeout(r, 0));
  }

  ctx.putImageData(imgData, 0, 0);

  // Show canvas, hide placeholder
  $('proj-placeholder').style.display = 'none';
  canvas.style.display = 'block';

  $('proc-progress').style.display = 'none';
  $('process-btn').disabled  = false;
  $('download-btn').disabled = false;
  busy = false;
});

// ── Download ──────────────────────────────────────────────────────────────────
$('download-btn').addEventListener('click', () => {
  const canvas   = $('output-canvas');
  const projName = $('projection-select').value;
  canvas.toBlob(blob => {
    const a = Object.assign(document.createElement('a'), {
      href:     URL.createObjectURL(blob),
      download: `map-${projName}.png`,
    });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, 'image/png');
});
