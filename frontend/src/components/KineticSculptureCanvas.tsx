import { useEffect, useRef, useState } from 'react';
import type { FC } from 'react';

interface Block3D {
  baseX: number;
  baseY: number;
  baseZ: number;
  currentX: number;
  currentY: number;
  currentZ: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  size: number;
  phase: number;
  accent: boolean;
}

export const KineticSculptureCanvas: FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [activeMode, setActiveMode] = useState<'lattice' | 'cluster' | 'disperse'>('lattice');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let dpr = window.devicePixelRatio || 1;
    let width = canvas.offsetWidth;
    let height = canvas.offsetHeight;

    const resize = () => {
      if (!canvas) return;
      dpr = window.devicePixelRatio || 1;
      width = canvas.offsetWidth;
      height = canvas.offsetHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    };

    resize();

    const mouse = {
      x: 0,
      y: 0,
      targetRotX: 0.28,
      targetRotY: 0.52,
      rotX: 0.28,
      rotY: 0.52,
      isHovered: false,
      hoverX: 0,
      hoverY: 0,
    };

    // 16 meticulously arranged interlocking cubic blocks (architectural kinetic sculpture)
    const blocks: Block3D[] = [
      { baseX: 0, baseY: 0, baseZ: 0, currentX: 0, currentY: 0, currentZ: 0, targetX: 0, targetY: 0, targetZ: 0, size: 68, phase: 0, accent: true },
      { baseX: 70, baseY: -25, baseZ: 25, currentX: 70, currentY: -25, currentZ: 25, targetX: 70, targetY: -25, targetZ: 25, size: 52, phase: 1.2, accent: false },
      { baseX: -65, baseY: 30, baseZ: -20, currentX: -65, currentY: 30, currentZ: -20, targetX: -65, targetY: 30, targetZ: -20, size: 54, phase: 2.1, accent: false },
      { baseX: 35, baseY: 65, baseZ: 40, currentX: 35, currentY: 65, currentZ: 40, targetX: 35, targetY: 65, targetZ: 40, size: 46, phase: 3.4, accent: true },
      { baseX: -40, baseY: -65, baseZ: -30, currentX: -40, currentY: -65, currentZ: -30, targetX: -40, targetY: -65, targetZ: -30, size: 48, phase: 4.5, accent: false },
      { baseX: 85, baseY: 45, baseZ: -35, currentX: 85, currentY: 45, currentZ: -35, targetX: 85, targetY: 45, targetZ: -35, size: 42, phase: 0.8, accent: false },
      { baseX: -80, baseY: -25, baseZ: 45, currentX: -80, currentY: -25, currentZ: 45, targetX: -80, targetY: -25, targetZ: 45, size: 44, phase: 1.9, accent: true },
      { baseX: 15, baseY: -85, baseZ: 20, currentX: 15, currentY: -85, currentZ: 20, targetX: 15, targetY: -85, targetZ: 20, size: 38, phase: 2.8, accent: false },
      { baseX: -20, baseY: 85, baseZ: -25, currentX: -20, currentY: 85, currentZ: -25, targetX: -20, targetY: 85, targetZ: -25, size: 40, phase: 3.9, accent: false },
      { baseX: 105, baseY: -60, baseZ: -10, currentX: 105, currentY: -60, currentZ: -10, targetX: 105, targetY: -60, targetZ: -10, size: 34, phase: 4.7, accent: false },
      { baseX: -105, baseY: 55, baseZ: 25, currentX: -105, currentY: 55, currentZ: 25, targetX: -105, targetY: 55, targetZ: 25, size: 36, phase: 0.4, accent: false },
      { baseX: 45, baseY: -45, baseZ: -55, currentX: 45, currentY: -45, currentZ: -55, targetX: 45, targetY: -45, targetZ: -55, size: 36, phase: 1.5, accent: false },
      { baseX: -50, baseY: 40, baseZ: 60, currentX: -50, currentY: 40, currentZ: 60, targetX: -50, targetY: 40, targetZ: 60, size: 38, phase: 2.4, accent: false },
      { baseX: 0, baseY: 110, baseZ: 10, currentX: 0, currentY: 110, currentZ: 10, targetX: 0, targetY: 110, targetZ: 10, size: 32, phase: 3.2, accent: false },
      { baseX: -115, baseY: -75, baseZ: 0, currentX: -115, currentY: -75, currentZ: 0, targetX: -115, targetY: -75, targetZ: 0, size: 30, phase: 4.1, accent: false },
      { baseX: 120, baseY: 30, baseZ: 40, currentX: 120, currentY: 30, currentZ: 40, targetX: 120, targetY: 30, targetZ: 40, size: 32, phase: 5.0, accent: false },
    ];

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const normX = (e.clientX - rect.left) / width - 0.5;
      const normY = (e.clientY - rect.top) / height - 0.5;

      mouse.targetRotY = normX * 2.2 + 0.52;
      mouse.targetRotX = -normY * 1.8 + 0.28;
      mouse.isHovered = true;
      mouse.hoverX = e.clientX - rect.left;
      mouse.hoverY = e.clientY - rect.top;
    };

    const handleMouseLeave = () => {
      mouse.targetRotY = 0.52;
      mouse.targetRotX = 0.28;
      mouse.isHovered = false;
    };

    window.addEventListener('resize', resize);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    let time = 0;

    const render = () => {
      time += 0.015;
      ctx.clearRect(0, 0, width, height);

      // Smooth camera interpolation
      mouse.rotX += (mouse.targetRotX - mouse.rotX) * 0.06;
      mouse.rotY += (mouse.targetRotY - mouse.rotY) * 0.06;

      const cosX = Math.cos(mouse.rotX);
      const sinX = Math.sin(mouse.rotX);
      const cosY = Math.cos(mouse.rotY);
      const sinY = Math.sin(mouse.rotY);

      const cx = width / 2;
      const cy = height / 2;

      interface ProjectedBlock {
        px: number;
        py: number;
        pz: number;
        size: number;
        alpha: number;
        accent: boolean;
        distToMouse: number;
      }

      const projected: ProjectedBlock[] = [];

      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];

        // Mode adjustments
        let targetX = b.baseX;
        let targetY = b.baseY;
        let targetZ = b.baseZ;

        if (activeMode === 'cluster') {
          targetX = b.baseX * 0.55;
          targetY = b.baseY * 0.55;
          targetZ = b.baseZ * 0.55;
        } else if (activeMode === 'disperse') {
          targetX = b.baseX * 1.45;
          targetY = b.baseY * 1.45;
          targetZ = b.baseZ * 1.45;
        }

        // Smooth physics towards target
        b.currentX += (targetX - b.currentX) * 0.08;
        b.currentY += (targetY - b.currentY) * 0.08;
        b.currentZ += (targetZ - b.currentZ) * 0.08;

        // Subtle organic breathing oscillation
        const breathY = Math.sin(time + b.phase) * 7;
        const breathX = Math.cos(time + b.phase * 0.8) * 5;

        const wx = b.currentX + breathX;
        const wy = b.currentY + breathY;
        const wz = b.currentZ;

        // 3D Matrix Y-Rotation
        const x1 = wx * cosY - wz * sinY;
        const z1 = wx * sinY + wz * cosY;

        // 3D Matrix X-Rotation
        const y2 = wy * cosX - z1 * sinX;
        const z2 = wy * sinX + z1 * cosX;

        // Perspective projection
        const fov = 480;
        const scale = fov / (fov + z2 + 200);
        const px = cx + x1 * scale;
        const py = cy + y2 * scale;

        const distToMouse = mouse.isHovered
          ? Math.hypot(px - mouse.hoverX, py - mouse.hoverY)
          : 999;

        projected.push({
          px,
          py,
          pz: z2,
          size: b.size * scale,
          alpha: Math.min(1, Math.max(0.25, (z2 + 260) / 480)),
          accent: b.accent,
          distToMouse
        });
      }

      // Sort back-to-front (Painter's algorithm)
      projected.sort((a, b) => b.pz - a.pz);

      // Draw refined architectural lattice connector lines
      ctx.strokeStyle = 'rgba(215, 205, 190, 0.45)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);

      for (let i = 0; i < projected.length; i++) {
        for (let j = i + 1; j < projected.length; j++) {
          const p1 = projected[i];
          const p2 = projected[j];
          const dist = Math.hypot(p1.px - p2.px, p1.py - p2.py);
          if (dist < 115) {
            ctx.beginPath();
            ctx.moveTo(p1.px, p1.py);
            ctx.lineTo(p2.px, p2.py);
            ctx.stroke();
          }
        }
      }

      ctx.setLineDash([]);

      // Draw each 3D pristine architectural block
      for (let i = 0; i < projected.length; i++) {
        const p = projected[i];
        const s = p.size;
        const half = s / 2;

        ctx.save();
        ctx.translate(p.px, p.py);

        // Interactive cursor proximity reaction
        const isNearCursor = p.distToMouse < 90;
        if (isNearCursor) {
          ctx.shadowColor = 'rgba(224, 90, 71, 0.28)';
          ctx.shadowBlur = 24;
        } else {
          ctx.shadowColor = 'rgba(25, 27, 26, 0.07)';
          ctx.shadowBlur = 14 * (p.size / 60);
          ctx.shadowOffsetY = 7 * (p.size / 60);
        }

        // Top Face (Lit surface)
        ctx.fillStyle = `rgba(255, 255, 255, ${0.98 * p.alpha})`;
        ctx.strokeStyle = isNearCursor
          ? `rgba(224, 90, 71, ${0.9 * p.alpha})`
          : `rgba(218, 208, 194, ${0.85 * p.alpha})`;
        ctx.lineWidth = isNearCursor ? 1.6 : 1.2;

        ctx.beginPath();
        ctx.moveTo(0, -half * 0.7);
        ctx.lineTo(half, -half * 0.2);
        ctx.lineTo(0, half * 0.3);
        ctx.lineTo(-half, -half * 0.2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Left Face (Shadowed surface)
        ctx.fillStyle = `rgba(243, 238, 228, ${0.92 * p.alpha})`;
        ctx.beginPath();
        ctx.moveTo(-half, -half * 0.2);
        ctx.lineTo(0, half * 0.3);
        ctx.lineTo(0, half * 1.15);
        ctx.lineTo(-half, half * 0.65);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Right Face (Ambient bounce surface)
        ctx.fillStyle = `rgba(232, 225, 213, ${0.92 * p.alpha})`;
        ctx.beginPath();
        ctx.moveTo(0, half * 0.3);
        ctx.lineTo(half, -half * 0.2);
        ctx.lineTo(half, half * 0.65);
        ctx.lineTo(0, half * 1.15);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // High-end Terracotta edge highlight for hero accent blocks
        if (p.accent || isNearCursor) {
          ctx.strokeStyle = `rgba(224, 90, 71, ${0.85 * p.alpha})`;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(0, half * 0.3);
          ctx.lineTo(0, half * 1.15);
          ctx.stroke();
        }

        ctx.restore();
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(animId);
    };
  }, [activeMode]);

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-grab active:cursor-grabbing pointer-events-auto"
        style={{ touchAction: 'none' }}
      />
      {/* Interactive Mode Pills in bottom-right corner of sculpture */}
      <div className="absolute bottom-3 right-3 flex items-center space-x-1.5 bg-white/85 backdrop-blur-xs border border-linen-300 p-1 rounded-full shadow-xs text-[10px] font-mono z-10">
        <button
          onClick={() => setActiveMode('lattice')}
          className={`px-2.5 py-0.5 rounded-full transition-colors ${
            activeMode === 'lattice' ? 'bg-charcoal-900 text-white font-bold' : 'text-charcoal-600 hover:text-charcoal-900'
          }`}
        >
          Lattice
        </button>
        <button
          onClick={() => setActiveMode('cluster')}
          className={`px-2.5 py-0.5 rounded-full transition-colors ${
            activeMode === 'cluster' ? 'bg-charcoal-900 text-white font-bold' : 'text-charcoal-600 hover:text-charcoal-900'
          }`}
        >
          Cluster
        </button>
        <button
          onClick={() => setActiveMode('disperse')}
          className={`px-2.5 py-0.5 rounded-full transition-colors ${
            activeMode === 'disperse' ? 'bg-charcoal-900 text-white font-bold' : 'text-charcoal-600 hover:text-charcoal-900'
          }`}
        >
          Disperse
        </button>
      </div>
    </div>
  );
};