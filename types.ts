
export interface ControlState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  run: boolean;
  resetCamera: boolean;
}

export interface JoystickData {
  x: number;
  y: number;
  active: boolean;
}
