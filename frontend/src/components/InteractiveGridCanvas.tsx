import { useEffect, useRef } from 'react';
import type { FC } from 'react';

interface Block {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  targetOpacity: number;
  rotation: number;
}

export const InteractiveGridCanvas: FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = canvas.offsetWidth);
    let height = (canvas.height = canvas.offsetHeight);

    const mouse = {
      x: -1000,
      y: -1000,
      radius: 140,
      isActive: false
    };

    // Generate grid of subtle floating white blocks
    const spacing = 36;
    const blockSize = 14;
    const blocks: Block[] = [];

    const initBlocks = () => {
      blocks.length = 0;
      const cols = Math.ceil(width / spacing) + 1;
      const rows = Math.ceil(height / spacing) + 1;

      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const baseX = i * spacing + (j % 2 === 0 ? 0 : spacing * 0.5);
          const baseY = j * spacing;
          blocks.push({
            x: baseX,
            y: baseY,
            baseX: baseX,
            baseY: baseY,
            vx: 0,
            vy: 0,
            size: blockSize,
            opacity: 0.28,
            targetOpacity: 0.28,
            rotation: 0
          });
        }
      }
    };

    initBlocks();

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
      initBlocks();
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.isActive = true;
    };

    const handleMouseLeave = () => {
      mouse.x = -1000;
      mouse.y = -1000;
      mouse.isActive = false;
    };

    window.addEventListener('resize', handleResize);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    // Physics Loop: Spring back to baseline with cursor displacement
    const render = () => {
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];

        // Proximity calculation to mouse cursor
        const dx = mouse.x - b.x;
        const dy = mouse.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < mouse.radius && mouse.isActive) {
          // Push block away from cursor (magnetic displacement)
          const angle = Math.atan2(dy, dx);
          const force = (mouse.radius - dist) / mouse.radius;
          const pushX = Math.cos(angle) * force * 16;
          const pushY = Math.sin(angle) * force * 16;

          b.vx -= pushX;
          b.vy -= pushY;
          b.targetOpacity = 0.85;
          b.rotation = force * 0.25;
        } else {
          b.targetOpacity = 0.28;
          b.rotation *= 0.9;
        }

        // Spring physics: pull block back toward original (baseX, baseY)
        const springFactor = 0.08;
        const damping = 0.82;

        const homeDx = b.baseX - b.x;
        const homeDy = b.baseY - b.y;

        b.vx += homeDx * springFactor;
        b.vy += homeDy * springFactor;

        b.vx *= damping;
        b.vy *= damping;

        b.x += b.vx;
        b.y += b.vy;

        // Smooth opacity transition
        b.opacity += (b.targetOpacity - b.opacity) * 0.1;

        // Draw rounded rectangle block
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rotation);

        // Subtle soft shadow when near cursor
        if (b.opacity > 0.4) {
          ctx.shadowColor = 'rgba(200, 75, 49, 0.15)';
          ctx.shadowBlur = 8;
        }

        // Block fill (warm white block)
        ctx.fillStyle = `rgba(255, 255, 255, ${b.opacity})`;
        ctx.strokeStyle = `rgba(222, 215, 200, ${b.opacity * 0.9})`;
        ctx.lineWidth = 1;

        const r = 3;
        const s = b.size;
        ctx.beginPath();
        ctx.roundRect(-s / 2, -s / 2, s, s, r);
        ctx.fill();
        ctx.stroke();

        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-auto"
      style={{ touchAction: 'none' }}
    />
  );
};
