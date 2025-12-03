import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

const Background = () => {
    return (
        <div className="fixed inset-0 z-[-1] overflow-hidden bg-[#050505]">
            {/* Nebula Mesh Gradient */}
            <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] rounded-full bg-violet-900/30 blur-[120px] animate-pulse" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[70%] h-[70%] rounded-full bg-indigo-900/20 blur-[120px] animate-pulse delay-1000" />
            <div className="absolute top-[40%] left-[30%] w-[40%] h-[40%] rounded-full bg-fuchsia-900/20 blur-[100px] animate-float" />

            {/* Aurora Lights */}
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150 mix-blend-overlay"></div>

            {/* Floating Particles */}
            <Particles />
        </div>
    );
};

const Particles = () => {
    // Generate random particles
    const particles = Array.from({ length: 50 }).map((_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 3 + 1,
        duration: Math.random() * 20 + 10,
        delay: Math.random() * 5,
    }));

    return (
        <div className="absolute inset-0 pointer-events-none">
            {particles.map((p) => (
                <motion.div
                    key={p.id}
                    className="absolute rounded-full bg-white/30"
                    style={{
                        left: `${p.x}%`,
                        top: `${p.y}%`,
                        width: p.size,
                        height: p.size,
                    }}
                    animate={{
                        y: [0, -100, 0],
                        opacity: [0, 0.8, 0],
                        scale: [0, 1.5, 0],
                    }}
                    transition={{
                        duration: p.duration,
                        repeat: Infinity,
                        delay: p.delay,
                        ease: "linear",
                    }}
                />
            ))}
        </div>
    );
};

export default Background;
