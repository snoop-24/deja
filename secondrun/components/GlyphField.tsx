'use client';

import { useEffect, useRef } from 'react';

/**
 * A tumbling globe of glyphs, built from concentric rings.
 *
 * The glyphs sit on latitude rings — circles stacked from pole to pole, each
 * one evenly divided — so the sphere reads as constructed rather than
 * scattered. Ring radius follows cos(latitude), and the number of glyphs on
 * each ring is proportional to that radius, which keeps the spacing *along*
 * every ring roughly equal instead of crowding at the poles.
 *
 * It tumbles on all three axes rather than spinning about its polar axis, and
 * that is deliberate: rotation about the polar axis maps every latitude ring
 * exactly onto itself, so the silhouette never changes and the globe looks
 * frozen no matter how fast it turns. Tilting the rings is what makes the
 * motion visible.
 *
 * The far hemisphere is drawn faintly rather than culled: watching rings pass
 * behind and come round again is most of what sells it as a ball.
 */

const GLYPHS = [
  'T', '⊥', '┼', '│', '─', '└', '┐', '┌', '┘', '╷', '╵',
  // Repeated on purpose: solid and hatched blocks carry the globe's weight.
  '▪', '▪', '▪', '▒', '▒', '■',
];

/*
 * Latitude rings from pole to pole, and how many glyphs sit on the equator.
 *
 * The ratio between these two is what decides whether the globe reads as a
 * set of concentric circles or as a scatter. Spacing *along* a ring must be
 * clearly tighter than the gap *between* rings, or the eye finds no circles.
 * At 13 and 76 the along-ring spacing is roughly a third of the ring gap,
 * which draws each circle as a continuous line with clear space around it.
 */
const RINGS = 13;
/** Glyphs on the equator; every other ring is scaled down by its radius. */
const PER_RING = 76;
/** Glyph size at the globe's nearest point; scaled down with depth. */
const FONT_PX = 15;

/*
 * The globe turns a full 360 degrees about all three axes, at three
 * deliberately incommensurate rates. Because 8s, 19s and 31s share no common
 * multiple worth waiting for, the combined orientation effectively never
 * repeats — it reads as free tumbling rather than as a loop, with no
 * Math.random involved, so the globe is identical on every mount.
 */
const SPIN_Y = 0.00079; // ~8.0s per revolution — the dominant spin
const SPIN_X = 0.00033; // ~19.0s
const SPIN_Z = 0.000203; // ~31.0s

/*
 * Slow sinusoidal drift on the two secondary axes. Three constant rates alone
 * tumble evenly, which still reads as machinery; letting the secondary axes
 * wander makes the motion look unplanned. Each amplitude-times-rate stays well
 * under its base rate, so every axis still turns monotonically through a full
 * 360 rather than rocking back and forth.
 */
const DRIFT_X = 0.38;
const DRIFT_X_RATE = 0.00012;
const DRIFT_Z = 0.3;
const DRIFT_Z_RATE = 0.00008;

/** How much nearer glyphs spread outward. 0 is orthographic. */
const PERSPECTIVE = 0.22;
/** Per-glyph character swap interval, in ms, before per-glyph staggering. */
const MUTATE_MS = 7000;
/** The globe as a fraction of the canvas half-size, leaving room to breathe. */
const FILL = 0.82;

/** Offsets each ring's starting angle, so the rings form no hard seam. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Stable per-glyph randomness — the globe is identical on every mount. */
function hash(a: number, b: number): number {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

interface Point {
  seed: number;
  x: number;
  y: number;
  z: number;
  alpha: number;
  phase: number;
}

function buildPoints(): Point[] {
  const points: Point[] = [];
  let seed = 0;

  for (let ring = 0; ring < RINGS; ring += 1) {
    // Half-step in from each pole, so no ring collapses to a single point.
    const latitude = -Math.PI / 2 + ((ring + 0.5) / RINGS) * Math.PI;
    const y = Math.sin(latitude);
    const ringRadius = Math.cos(latitude);

    // Proportional to circumference, so spacing along each ring is even.
    const count = Math.max(5, Math.round(PER_RING * ringRadius));
    // Rotating each ring by the golden angle avoids every ring starting at the
    // same longitude, which would draw a visible seam down the globe.
    const offset = ring * GOLDEN_ANGLE;

    for (let i = 0; i < count; i += 1) {
      const angle = offset + (i / count) * Math.PI * 2;
      points.push({
        seed,
        x: Math.cos(angle) * ringRadius,
        y,
        z: Math.sin(angle) * ringRadius,
        // Only a little variation — the structure should read as ordered.
        alpha: 0.84 + 0.16 * hash(seed, 11.3),
        phase: hash(seed, 13.9) * Math.PI * 2,
      });
      seed += 1;
    }
  }

  return points;
}

interface Projected {
  point: Point;
  x: number;
  y: number;
  z: number;
}

export function GlyphField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const points = buildPoints();
    // Reused every frame so the per-frame depth sort allocates nothing.
    const projected: Projected[] = points.map((point) => ({ point, x: 0, y: 0, z: 0 }));

    let width = 0;
    let height = 0;
    let radius = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      width = rect.width;
      height = rect.height;
      radius = (Math.min(width, height) / 2) * FILL;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, width, height);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Matches --color-graphite. Canvas cannot read CSS custom properties.
      ctx.fillStyle = '#17140f';

      const cx = width / 2;
      const cy = height / 2;

      // Three independent angles, each sweeping a full 360 degrees, the two
      // secondary ones wandering. Computed once per frame, not per glyph.
      const angleY = t * SPIN_Y;
      const angleX = t * SPIN_X + DRIFT_X * Math.sin(t * DRIFT_X_RATE);
      const angleZ = t * SPIN_Z + DRIFT_Z * Math.sin(t * DRIFT_Z_RATE + 1.7);

      const cosY = Math.cos(angleY);
      const sinY = Math.sin(angleY);
      const cosX = Math.cos(angleX);
      const sinX = Math.sin(angleX);
      const cosZ = Math.cos(angleZ);
      const sinZ = Math.sin(angleZ);

      for (let i = 0; i < points.length; i += 1) {
        const p = points[i];

        // Yaw, then pitch, then roll. Order matters only in that it must be
        // consistent; any fixed order composes into a free tumble.
        const x1 = p.x * cosY + p.z * sinY;
        const z1 = p.z * cosY - p.x * sinY;

        const y2 = p.y * cosX - z1 * sinX;
        const z2 = p.y * sinX + z1 * cosX;

        const q = projected[i];
        q.point = p;
        q.x = x1 * cosZ - y2 * sinZ;
        q.y = x1 * sinZ + y2 * cosZ;
        q.z = z2;
      }

      // Painter's algorithm: far side first, so near glyphs sit on top.
      projected.sort((a, b) => a.z - b.z);

      let currentFont = '';
      for (const item of projected) {
        // 0 at the far pole, 1 at the near one.
        const depth = (item.z + 1) / 2;
        const scale = 1 / (1 - item.z * PERSPECTIVE);
        const twinkle = reduced
          ? 1
          : 0.9 + 0.1 * Math.sin(t * 0.0015 + item.point.phase);

        // Quantised so the sorted draw only changes ctx.font a handful of
        // times per frame instead of once per glyph.
        const size = Math.round(FONT_PX * (0.66 + 0.52 * depth));
        const font = `${size}px ui-monospace, Menlo, Consolas, monospace`;
        if (font !== currentFont) {
          ctx.font = font;
          currentFont = font;
        }

        const era = reduced ? 0 : Math.floor(t / MUTATE_MS + item.point.phase);
        // Squared depth so the far hemisphere drops away quickly and the globe
        // reads as solid rather than as a transparent cage.
        ctx.globalAlpha = item.point.alpha * (0.1 + 0.9 * depth * depth) * twinkle;
        ctx.fillText(
          GLYPHS[Math.floor(hash(item.point.seed, 7.7 + era) * GLYPHS.length)],
          cx + item.x * radius * scale,
          cy + item.y * radius * scale,
        );
      }

      ctx.globalAlpha = 1;
    };

    resize();

    if (reduced) {
      draw(0);
      return;
    }

    let frame = 0;
    let last = 0;
    const loop = (now: number) => {
      // ~30fps. The rotation is slow enough that halving the frames costs
      // nothing visually and leaves the main thread to the rest of the page.
      if (now - last > 33) {
        draw(now);
        last = now;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  // Fills the column it is given, so it can never reach the copy. It bleeds
  // 4rem past the right edge into the page padding, which reads as continuing
  // off-frame, and is capped by viewport height so a wide window cannot make
  // it taller than the screen.
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 right-[-4rem] aspect-square w-full max-w-[min(760px,72vh)] -translate-y-1/2 [mask-image:radial-gradient(closest-side,black_88%,transparent_100%)]"
    >
      <canvas ref={canvasRef} className="size-full" />
    </div>
  );
}
