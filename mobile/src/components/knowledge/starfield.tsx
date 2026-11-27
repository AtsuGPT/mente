import { useEffect, useRef } from "react";

/**
 * Fundo do mapa (redesign de 27/11): estrelas brancas espalhadas, como o espaço, e algumas ligadas por fios
 * finíssimos, como neurônios. Piscam devagar e derivam quase parados. Um canvas só, a ~30 quadros por segundo; para
 * com a aba escondida e fica parado com "reduzir movimento".
 */
type Star = { x: number; y: number; r: number; a: number; phase: number; speed: number; tint: boolean };

function random(seed: number) {
  // mulberry32: o mesmo céu a cada abertura (nada de estrelas pulando de lugar ao redimensionar).
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let stars: Star[] = [];
    let links: [Star, Star][] = [];
    let width = 0;
    let height = 0;
    let dpr = 1;
    let frame = 0;
    let last = 0;

    const build = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const rand = random(27);
      const count = Math.round((width * height) / 2400);
      stars = Array.from({ length: count }, () => {
        const big = rand() < 0.12;
        return { x: rand() * width, y: rand() * height, r: big ? 0.9 + rand() * 0.8 : 0.35 + rand() * 0.5, a: big ? 0.5 + rand() * 0.4 : 0.12 + rand() * 0.4, phase: rand() * Math.PI * 2, speed: 0.4 + rand() * 1.1, tint: rand() < 0.22 };
      });
      // Fios de "neurônio": cada estrela grande se liga às duas vizinhas mais perto (até 90 px).
      links = [];
      const bigs = stars.filter((s) => s.r > 0.9);
      for (const s of bigs) {
        const near = stars
          .filter((o) => o !== s)
          .map((o) => [o, (o.x - s.x) ** 2 + (o.y - s.y) ** 2] as const)
          .filter(([, d]) => d < 90 * 90)
          .sort((p, q) => p[1] - q[1])
          .slice(0, 2);
        for (const [o] of near) links.push([s, o]);
      }
      draw(performance.now());
    };

    const draw = (now: number) => {
      const t = now / 1000;
      const drift = reduce ? 0 : t * 1.5;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const px = (x: number) => (((x + drift) % width) + width) % width;
      ctx.lineWidth = 0.6;
      for (const [s, o] of links) {
        const ax = px(s.x);
        const bx = px(o.x);
        if (Math.abs(ax - bx) > 120) continue; // a ligação não atravessa a borda quando a estrela volta do outro lado
        const pulse = reduce ? 0.5 : 0.5 + 0.5 * Math.sin(t * 0.6 + s.phase);
        ctx.strokeStyle = `rgba(199,183,250,${0.035 + pulse * 0.05})`;
        ctx.beginPath();
        ctx.moveTo(ax, s.y);
        ctx.lineTo(bx, o.y);
        ctx.stroke();
      }
      for (const s of stars) {
        const twinkle = reduce ? 0.8 : 0.6 + 0.4 * Math.sin(t * s.speed + s.phase);
        const alpha = s.a * twinkle;
        const x = px(s.x);
        if (s.r > 0.9) {
          const glow = ctx.createRadialGradient(x, s.y, 0, x, s.y, s.r * 4);
          glow.addColorStop(0, s.tint ? `rgba(199,183,250,${alpha * 0.5})` : `rgba(255,255,255,${alpha * 0.45})`);
          glow.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(x, s.y, s.r * 4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = s.tint ? `rgba(214,203,252,${alpha})` : `rgba(255,255,255,${alpha})`;
        ctx.beginPath();
        ctx.arc(x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (now - last < 33) return;
      last = now;
      draw(now);
    };
    build();
    const observer = new ResizeObserver(build);
    observer.observe(canvas);
    const onVisibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden && !reduce) frame = requestAnimationFrame(loop);
    };
    document.addEventListener("visibilitychange", onVisibility);
    if (!reduce) frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return <canvas ref={ref} className="kstars" aria-hidden />;
}
