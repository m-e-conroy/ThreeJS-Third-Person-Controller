
import React, { useRef, useState, useEffect, useCallback } from 'react';

interface JoystickProps {
  onMove: (data: { x: number; y: number; active: boolean }) => void;
}

const Joystick: React.FC<JoystickProps> = ({ onMove }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const activeTouchId = useRef<number | null>(null);

  const handleStart = (e: React.TouchEvent | React.MouseEvent) => {
    if ('touches' in e) {
      // Track only the first touch that hits the joystick area
      activeTouchId.current = e.changedTouches[0].identifier;
    }
    setIsDragging(true);
  };

  const handleMove = useCallback((e: TouchEvent | MouseEvent) => {
    if (!isDragging || !containerRef.current) return;

    let clientX: number, clientY: number;

    if ('touches' in e) {
      // Find the specific touch that started this interaction
      const touches = Array.from(e.touches);
      const touch = touches.find(t => t.identifier === activeTouchId.current);
      
      // If our specific touch isn't found in the current touches list, ignore this move event
      if (!touch) return;
      
      clientX = touch.clientX;
      clientY = touch.clientY;
    } else {
      clientX = (e as MouseEvent).clientX;
      clientY = (e as MouseEvent).clientY;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const maxDistance = rect.width / 2;

    const limitedDistance = Math.min(distance, maxDistance);
    const angle = Math.atan2(dy, dx);
    
    // Normalized values for the game engine (-1 to 1)
    const x = Math.cos(angle) * (limitedDistance / maxDistance);
    const y = Math.sin(angle) * (limitedDistance / maxDistance);

    setPosition({ 
      x: Math.cos(angle) * limitedDistance, 
      y: Math.sin(angle) * limitedDistance 
    });

    onMove({ x, y, active: true });
  }, [isDragging, onMove]);

  const handleEnd = useCallback((e: TouchEvent | MouseEvent) => {
    if ('touches' in e) {
      // Only reset if the finger that was lifted is the one we are tracking
      const changedTouches = Array.from((e as TouchEvent).changedTouches);
      const isOurTouch = changedTouches.some(t => t.identifier === activeTouchId.current);
      if (!isOurTouch) return;
    }

    setIsDragging(false);
    activeTouchId.current = null;
    setPosition({ x: 0, y: 0 });
    onMove({ x: 0, y: 0, active: false });
  }, [onMove]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleEnd);
      window.addEventListener('touchmove', handleMove, { passive: false });
      window.addEventListener('touchend', handleEnd);
      window.addEventListener('touchcancel', handleEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('touchcancel', handleEnd);
    };
  }, [isDragging, handleMove, handleEnd]);

  return (
    <div 
      ref={containerRef}
      onMouseDown={handleStart}
      onTouchStart={handleStart}
      className="relative w-32 h-32 bg-white/10 rounded-full border-2 border-white/20 backdrop-blur-md flex items-center justify-center touch-none select-none"
    >
      <div 
        className="w-12 h-12 bg-blue-500 rounded-full shadow-lg shadow-blue-500/50 transition-transform duration-75"
        style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
      />
    </div>
  );
};

export default Joystick;
