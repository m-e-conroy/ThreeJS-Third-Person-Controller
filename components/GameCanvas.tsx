
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { Capsule } from 'three/examples/jsm/math/Capsule.js';

const MODEL_URL = 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/models/gltf/RobotExpressive/RobotExpressive.glb';

// --- Character Class ---
class Unit {
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

    // Collide with Floor (Raycast is simpler for infinite planes)
    // but here we just check Y coordinate vs floor Y
    if (this.group.position.y <= 0) {
      this.group.position.y = 0;
      this.isGrounded = true;
      if (!wasGroundedBefore) this.spawnDustCallback(this.group.position);
    }

    // Collide with Obstacles
    for (const mesh of obstacles) {
      // Basic bounding box check for speed
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld);
      
      // If the capsule is near the box
      if (box.intersectsSphere(new THREE.Sphere(this.group.position, this.height))) {
        // More precise: check if capsule is inside or hitting the mesh
        // For simplicity in this demo, we use a sphere-box collision resolve
        const closestPoint = new THREE.Vector3();
        box.clampPoint(this.group.position, closestPoint);
        const distance = this.group.position.distanceTo(closestPoint);
        
        if (distance < this.radius) {
          const normal = this.group.position.clone().sub(closestPoint).normalize();
          const overlap = this.radius - distance;
          this.group.position.add(normal.multiplyScalar(overlap));
          // Kill velocity in that direction
          this.velocity.projectOnPlane(normal);
        }
      }
    }
  }
}

// --- Main Component ---
interface GameCanvasProps {
  controlState: React.MutableRefObject<any>;
  joystickState: React.MutableRefObject<any>;
  updateGamepad: () => void;
  testAnimation?: string | null;
  onAnimationsLoaded?: (names: string[]) => void;
  bloomEnabled?: boolean;
  aoEnabled?: boolean;
}

const GameCanvas: React.FC<GameCanvasProps> = ({ 
  controlState, joystickState, updateGamepad, testAnimation, onAnimationsLoaded, bloomEnabled = true, aoEnabled = true
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  
  const bloomRef = useRef(bloomEnabled);
  const aoRef = useRef(aoEnabled);
  const testAnimRef = useRef(testAnimation);

  const unitRef = useRef<Unit | null>(null);
  const obstaclesRef = useRef<THREE.Mesh[]>([]);
  const dustParticles = useRef<any[]>([]);

  useEffect(() => { bloomRef.current = bloomEnabled; }, [bloomEnabled]);
  useEffect(() => { aoRef.current = aoEnabled; }, [aoEnabled]);
  useEffect(() => { testAnimRef.current = testAnimation; }, [testAnimation]);

  const cameraOrbit = useRef({ theta: Math.PI, phi: 0.3, distance: 7.0, targetTheta: Math.PI, targetPhi: 0.3 });
  const isDragging = useRef(false);
  const previousMouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!containerRef.current || initialized.current) return;
    initialized.current = true;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x141428);
    scene.fog = new THREE.FogExp2(0x141428, 0.025);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.6;
    containerRef.current.appendChild(renderer.domElement);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    
    const ssao = new SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
    ssao.kernelRadius = 16;
    ssao.minDistance = 0.005;
    ssao.maxDistance = 0.15;
    composer.addPass(ssao);

    const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.5, 0.4, 0.8);
    composer.addPass(bloom);

    // Environment
    const ambient = new THREE.AmbientLight(0xffffff, 1.8);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 5.0);
    sun.position.set(20, 30, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    scene.add(sun);

    const floorGeo = new THREE.PlaneGeometry(300, 300);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a1a24 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(300, 60, 0x60a5fa, 0x2e2e4a);
    grid.position.y = 0.01;
    scene.add(grid);

    // Add Obstacles
    const createObstacle = (pos: THREE.Vector3, size: THREE.Vector3) => {
      const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
      const mat = new THREE.MeshStandardMaterial({ color: 0x222233, roughness: 0.1, metalness: 0.8 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      mesh.position.y += size.y / 2;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      obstaclesRef.current.push(mesh);

      // Glow wireframe
      const wire = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.3 })
      );
      mesh.add(wire);
    };

    createObstacle(new THREE.Vector3(10, 0, 10), new THREE.Vector3(4, 8, 4));
    createObstacle(new THREE.Vector3(-15, 0, 5), new THREE.Vector3(6, 4, 6));
    createObstacle(new THREE.Vector3(5, 0, -20), new THREE.Vector3(10, 2, 2));

    // Dust Callback
    const spawnDust = (pos: THREE.Vector3) => {
      const particleCount = 15;
      const geo = new THREE.SphereGeometry(0.12, 8, 8);
      for (let i = 0; i < particleCount; i++) {
        const mat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.5, depthWrite: false });
        const p = new THREE.Mesh(geo, mat);
        p.position.copy(pos).add(new THREE.Vector3((Math.random()-0.5)*0.5, 0.05, (Math.random()-0.5)*0.5));
        const velocity = new THREE.Vector3((Math.random()-0.5)*2, Math.random()*2 + 1, (Math.random()-0.5)*2);
        scene.add(p);
        dustParticles.current.push({ mesh: p, velocity, life: 1.0 });
      }
    };

    // Instantiate Character
    const character = new Unit(new THREE.Vector3(0, 0, 0), spawnDust);
    character.load(onAnimationsLoaded);
    scene.add(character.group);
    unitRef.current = character;

    // Events
    const onMouseDown = (e: MouseEvent) => { isDragging.current = true; previousMouse.current = { x: e.clientX, y: e.clientY }; };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - previousMouse.current.x;
      const dy = e.clientY - previousMouse.current.y;
      cameraOrbit.current.targetTheta -= dx * 0.008;
      cameraOrbit.current.targetPhi = THREE.MathUtils.clamp(cameraOrbit.current.targetPhi + dy * 0.008, -0.2, 1.3);
      previousMouse.current = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = () => isDragging.current = false;
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    containerRef.current.addEventListener('mousedown', onMouseDown);

    const clock = new THREE.Clock();
    const animate = () => {
      const delta = Math.min(clock.getDelta(), 0.1);
      updateGamepad();

      ssao.enabled = aoRef.current;
      bloom.enabled = bloomRef.current;

      if (unitRef.current) {
        const char = unitRef.current;
        const controls = controlState.current;
        
        // Update Camera Lerp
        if (controls.resetCamera) {
          cameraOrbit.current.targetTheta = char.group.rotation.y + Math.PI;
          cameraOrbit.current.targetPhi = 0.3;
        }
        cameraOrbit.current.theta = THREE.MathUtils.lerp(cameraOrbit.current.theta, cameraOrbit.current.targetTheta, 0.1);
        cameraOrbit.current.phi = THREE.MathUtils.lerp(cameraOrbit.current.phi, cameraOrbit.current.targetPhi, 0.1);

        // Character Logic
        char.update(delta, controls, joystickState.current, cameraOrbit.current.theta, testAnimRef.current);
        char.checkCollisions(obstaclesRef.current, floor);

        // Camera Follow
        const dist = controls.run ? 8.5 : 7.0;
        const offset = new THREE.Vector3(
          dist * Math.sin(cameraOrbit.current.theta) * Math.cos(cameraOrbit.current.phi),
          dist * Math.sin(cameraOrbit.current.phi),
          dist * Math.cos(cameraOrbit.current.theta) * Math.cos(cameraOrbit.current.phi)
        );
        camera.position.copy(char.group.position).add(offset).add(new THREE.Vector3(0, 1.8, 0));
        camera.lookAt(char.group.position.clone().add(new THREE.Vector3(0, 1.8, 0)));
      }

      // Dust Particles
      for (let i = dustParticles.current.length - 1; i >= 0; i--) {
        const p = dustParticles.current[i];
        p.life -= delta * 0.8;
        if (p.life <= 0) {
          scene.remove(p.mesh);
          p.mesh.geometry.dispose();
          p.mesh.material.dispose();
          dustParticles.current.splice(i, 1);
        } else {
          p.mesh.position.add(p.velocity.clone().multiplyScalar(delta));
          p.velocity.y -= 2.0 * delta;
          p.mesh.scale.setScalar(1.0 + (1.0 - p.life) * 4);
          p.mesh.material.opacity = p.life * 0.5;
        }
      }

      composer.render();
      requestAnimationFrame(animate);
    };
    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      renderer.dispose();
    };
  }, []);

  return <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />;
};

export default GameCanvas;
