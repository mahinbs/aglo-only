import React, { ReactNode } from 'react';
import { motion, useAnimation, useInView } from 'framer-motion';

interface ScrollRevealProps {
    children: ReactNode;
    delay?: number;
    direction?: 'up' | 'down' | 'left' | 'right' | 'none';
    className?: string;
}

export const ScrollReveal = ({ children, delay = 0, direction = 'up', className = '' }: ScrollRevealProps) => {
    const ref = React.useRef(null);
    const isInView = useInView(ref, { once: true, margin: "-10%" });
    const controls = useAnimation();

    React.useEffect(() => {
        if (isInView) {
            controls.start("visible");
        }
    }, [isInView, controls]);

    const getDirectionOffset = () => {
        switch (direction) {
            case 'up': return { y: 50 };
            case 'down': return { y: -50 };
            case 'left': return { x: 50 };
            case 'right': return { x: -50 };
            case 'none': return { x: 0, y: 0 };
            default: return { y: 50 };
        }
    };

    return (
        <motion.div
            ref={ref}
            variants={{
                hidden: {
                    opacity: 0,
                    ...getDirectionOffset()
                },
                visible: {
                    opacity: 1,
                    x: 0,
                    y: 0,
                    transition: {
                        duration: 0.8,
                        delay: delay,
                        ease: [0.25, 0.4, 0.25, 1],
                    }
                }
            }}
            initial="hidden"
            animate={controls}
            className={className}
        >
            {children}
        </motion.div>
    );
};
