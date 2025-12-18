
import { useEffect, useRef, useCallback } from 'react';
import { ControlState } from '../types';

export const useControls = () => {
  const controlState = useRef<ControlState>({
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    run: false,
    resetCamera: false,
  });

  const joystickState = useRef({ x: 0, y: 0, active: false });

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        controlState.current.forward = true;
        break;
      case 'KeyS':
      case 'ArrowDown':
        controlState.current.backward = true;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        controlState.current.left = true;
        break;
      case 'KeyD':
      case 'ArrowRight':
        controlState.current.right = true;
        break;
      case 'Space':
        controlState.current.jump = true;
        break;
      case 'ShiftLeft':
        controlState.current.run = true;
        break;
      case 'KeyR':
        controlState.current.resetCamera = true;
        break;
    }
  }, []);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        controlState.current.forward = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        controlState.current.backward = false;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        controlState.current.left = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        controlState.current.right = false;
        break;
      case 'Space':
        controlState.current.jump = false;
        break;
      case 'ShiftLeft':
        controlState.current.run = false;
        break;
      case 'KeyR':
        controlState.current.resetCamera = false;
        break;
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  // Gamepad Polling Logic
  const updateGamepad = useCallback(() => {
    const gamepads = navigator.getGamepads();
    const gp = gamepads[0]; // Primary controller
    if (!gp) return;

    // Movement Axis
    const axisX = gp.axes[0];
    const axisY = gp.axes[1];
    const threshold = 0.15;

    // Direct mapping for simplified movement
    controlState.current.forward = axisY < -threshold;
    controlState.current.backward = axisY > threshold;
    controlState.current.left = axisX < -threshold;
    controlState.current.right = axisX > threshold;

    // Buttons
    controlState.current.jump = gp.buttons[0].pressed; // A or Cross
    controlState.current.run = gp.buttons[10].pressed; // Left Stick Click
    controlState.current.resetCamera = gp.buttons[3].pressed; // Y or Triangle
  }, []);

  return { controlState, joystickState, updateGamepad };
};
