import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

const WarpTransition = () => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        let animationFrameId;

        // Set canvas size
        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        // Star properties
        const stars = [];
        const numStars = 1000;
        const speed = 25; // Warp speed
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        for (let i = 0; i < numStars; i++) {
            stars.push({
                x: Math.random() * canvas.width - centerX,
                y: Math.random() * canvas.height - centerY,
                z: Math.random() * canvas.width
            });
        }

        const draw = () => {
            // Fill with semi-transparent black for trail effect
            ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = '#db2777'; // Pink/Magenta from your palette
            ctx.strokeStyle = '#8b5cf6'; // Violet

            const cx = canvas.width / 2;
            const cy = canvas.height / 2;

            for (let i = 0; i < numStars; i++) {
                const star = stars[i];

                // Move star closer
                star.z -= speed;

                // Reset if passed camera
                if (star.z <= 0) {
                    star.z = canvas.width;
                    star.x = Math.random() * canvas.width - cx;
                    star.y = Math.random() * canvas.height - cy;
                }

                // Project 3D position to 2D
                const x = (star.x / star.z) * cx + cx;
                const y = (star.y / star.z) * cy + cy;

                // Calculate size based on proximity
                const size = (1 - star.z / canvas.width) * 4;

                // Draw star streak
                const prevZ = star.z + speed * 2;
                const prevX = (star.x / prevZ) * cx + cx;
                const prevY = (star.y / prevZ) * cy + cy;

                ctx.beginPath();
                ctx.moveTo(prevX, prevY);
                ctx.lineTo(x, y);
                ctx.lineWidth = size;
                ctx.stroke();

                // Draw star head
                ctx.beginPath();
                ctx.arc(x, y, size / 2, 0, Math.PI * 2);
                ctx.fill();
            }

            animationFrameId = requestAnimationFrame(draw);
        };

        draw();

        return () => {
            window.removeEventListener('resize', resizeCanvas);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 pointer-events-none"
        >
            <canvas ref={canvasRef} className="block w-full h-full" />
        </motion.div>
    );
};

export default WarpTransition;
