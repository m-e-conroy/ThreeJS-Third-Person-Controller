
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Capsule } from 'three/examples/jsm/math/Capsule.js';

const MODEL_URL = 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/models/gltf/RobotExpressive/RobotExpressive.glb';

export class Unit {
  group: THREE.Group;
  mixer?: THREE.AnimationMixer;
  actions: Record<string, THREE.AnimationAction> = {};
  currentAction: string = 'Idle';
  
  // Physics
  velocity = new THREE.Vector3();
  isGrounded = false;
  radius = 0.5;
  height = 1.6;
  capsule: Capsule;
  
  // Dust system access
  spawnDustCallback: (pos: THREE.Vector3) => void;

  constructor(spawnPos: THREE.Vector3, onDust: (pos: THREE.Vector3) => void) {
    this.group = new THREE.Group();
    this.group.position.copy(spawnPos);
    this.spawnDustCallback = onDust;
    
    // The capsule represents the "physical" space of the character
    // It goes from start (bottom) to end (top)
    this.capsule = new Capsule(
      new THREE.Vector3(0, this.radius, 0),
      new THREE.Vector3(0, this.height - this.radius, 0),
      this.radius
    );
  }

  async load(onLoaded?: (names: string[]) => void) {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(MODEL_URL);
    const model = gltf.scene;
    
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if (mat.emissive && mat.emissive.getHex() > 0) {
          mat.emissiveIntensity = 4.0;
        }
      }
    });

    this.group.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    
    const names: string[] = [];
    gltf.animations.forEach((clip) => {
      const action = this.mixer!.clipAction(clip);
      this.actions[clip.name] = action;
      names.push(clip.name);
    });

    if (this.actions['Idle']) {
      this.actions['Idle'].play();
    }
    
    if (onLoaded) onLoaded(names);
  }

  update(delta: number, controls: any, joystick: any, cameraTheta: number, testAnimation?: string | null) {
    if (!this.mixer) return;

    // 1. Handle Movement Input
    let moveX = 0, moveZ = 0;
    if (controls.forward) moveZ += 1;
    if (controls.backward) moveZ -= 1;
    if (controls.left) moveX -= 1;
    if (controls.right) moveX += 1;
    if (joystick.active) { moveX = joystick.x; moveZ = -joystick.y; }

    const isBoosting = controls.run;
    const speed = isBoosting ? 12.0 : 6.0;
    const inputMag = Math.min(new THREE.Vector2(moveX, moveZ).length(), 1.0);

    if (inputMag > 0.05) {
      const forward = new THREE.Vector3(-Math.sin(cameraTheta), 0, -Math.cos(cameraTheta));
      const right = new THREE.Vector3(Math.cos(cameraTheta), 0, -Math.sin(cameraTheta));
      const moveDir = new THREE.Vector3().addScaledVector(forward, moveZ).addScaledVector(right, moveX).normalize();
      
      const targetRot = Math.atan2(moveDir.x, moveDir.z);
      let diff = targetRot - this.group.rotation.y;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      this.group.rotation.y += diff * 0.15;

      this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, moveDir.x * inputMag * speed, 0.15);
      this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, moveDir.z * inputMag * speed, 0.15);
    } else {
      this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, 0, 0.15);
      this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, 0, 0.15);
    }

    // 2. Gravity & Jumping
    if (this.isGrounded) {
      this.velocity.y = 0;
      if (controls.jump) {
        this.velocity.y = 13.0;
        this.isGrounded = false;
        if (this.actions['Jump']) this.actions['Jump'].reset().setLoop(THREE.LoopOnce, 1).play();
      }
    } else {
      this.velocity.y -= 32.0 * delta;
    }

    // 3. Apply Velocity
    this.group.position.add(this.velocity.clone().multiplyScalar(delta));
    
    // Sync mathematical capsule with visual model
    this.capsule.start.set(0, this.radius, 0).add(this.group.position);
    this.capsule.end.set(0, this.height - this.radius, 0).add(this.group.position);

    // 4. Animations
    this.mixer.update(delta);
    const velMag = new THREE.Vector2(this.velocity.x, this.velocity.z).length();
    let next = 'Idle';
    if (!this.isGrounded) next = 'Jump';
    else if (velMag > 7.0) next = 'Running';
    else if (velMag > 0.5) next = 'Walking';

    const activeAction = testAnimation || next;
    if (this.currentAction !== activeAction && this.actions[activeAction]) {
      this.actions[this.currentAction]?.fadeOut(0.2);
      this.actions[activeAction].reset().fadeIn(0.2).play();
      this.currentAction = activeAction;
    }
  }

  checkCollisions(obstacles: THREE.Mesh[], floor: THREE.Mesh) {
    let wasGroundedBefore = this.isGrounded;
    this.isGrounded = false;

    // Collide with Floor
    if (this.group.position.y <= 0) {
      this.group.position.y = 0;
      this.isGrounded = true;
      if (!wasGroundedBefore) this.spawnDustCallback(this.group.position);
    }

    // Collide with Obstacles
    for (const mesh of obstacles) {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld);
      
      if (box.intersectsSphere(new THREE.Sphere(this.group.position, this.height))) {
        const closestPoint = new THREE.Vector3();
        box.clampPoint(this.group.position, closestPoint);
        const distance = this.group.position.distanceTo(closestPoint);
        
        if (distance < this.radius) {
          const normal = this.group.position.clone().sub(closestPoint).normalize();
          const overlap = this.radius - distance;
          this.group.position.add(normal.multiplyScalar(overlap));
          this.velocity.projectOnPlane(normal);
        }
      }
    }
  }
}

export default Unit;
