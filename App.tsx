
import React, { useState, useEffect, useRef } from 'react';
import GameCanvas from './components/GameCanvas';
import Joystick from './components/Joystick';
import { useControls } from './hooks/useControls';

const App: React.FC = () => {
  const { controlState, joystickState, updateGamepad } = useControls();
  const [isMobile, setIsMobile] = useState(false);
  const [isBoosting, setIsBoosting] = useState(false);
  const [speedPercent, setSpeedPercent] = useState(0);
  const [availableAnimations, setAvailableAnimations] = useState<string[]>([]);
  const [testAnimation, setTestAnimation] = useState<string | null>(null);
  const [showDocs, setShowDocs] = useState(false);
  const [bloomEnabled, setBloomEnabled] = useState(true);
  const [aoEnabled, setAoEnabled] = useState(true);
  const uiFrameRef = useRef<number>(null);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024 || 'ontouchstart' in window);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);

    const updateUI = () => {
      setIsBoosting(controlState.current.run);
      
      let targetSpeed = 0;
      const isUsingJoystick = joystickState.current.active;
      const joystickIntensity = isUsingJoystick 
        ? Math.min(Math.sqrt(joystickState.current.x ** 2 + joystickState.current.y ** 2), 1.0)
        : 0;

      const isUsingKeys = controlState.current.forward || 
                        controlState.current.backward || 
                        controlState.current.left || 
                        controlState.current.right;
      
      if (isUsingKeys || isUsingJoystick) {
        const basePotential = controlState.current.run ? 100 : 50;
        const currentIntensity = isUsingJoystick ? joystickIntensity : 1.0;
        targetSpeed = basePotential * currentIntensity;
      }
      
      setSpeedPercent(prev => prev + (targetSpeed - prev) * 0.1);
      uiFrameRef.current = requestAnimationFrame(updateUI);
    };
    uiFrameRef.current = requestAnimationFrame(updateUI);

    return () => {
      window.removeEventListener('resize', checkMobile);
      if (uiFrameRef.current) cancelAnimationFrame(uiFrameRef.current);
    };
  }, [controlState, joystickState]);

  const handleJoystickMove = (data: { x: number; y: number; active: boolean }) => {
    joystickState.current = data;
  };

  const handleJumpPress = () => {
    controlState.current.jump = true;
    setTimeout(() => { controlState.current.jump = false; }, 100);
  };

  const handleRecenterPress = () => {
    controlState.current.resetCamera = true;
    setTimeout(() => { controlState.current.resetCamera = false; }, 100);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black text-white selection:bg-blue-500">
      {/* Game Scene */}
      <GameCanvas 
        controlState={controlState} 
        joystickState={joystickState} 
        updateGamepad={updateGamepad}
        testAnimation={testAnimation}
        onAnimationsLoaded={setAvailableAnimations}
        bloomEnabled={bloomEnabled}
        aoEnabled={aoEnabled}
      />

      {/* UI Overlay */}
      <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6 md:p-10">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div className="font-orbitron pointer-events-auto">
            <h1 className={`text-2xl md:text-3xl font-bold tracking-tighter transition-colors duration-300 ${isBoosting ? 'text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.8)]' : 'text-blue-500'}`}>
              PHANTOM_UNIT
            </h1>
            <div className="flex items-center gap-3 mt-1">
              <span className={`w-2 h-2 rounded-full ${isBoosting ? 'bg-blue-400 animate-pulse' : 'bg-green-500'}`} />
              <p className="text-[10px] text-white/50 tracking-widest uppercase">
                {isBoosting ? 'Overdrive_Active' : 'System_Nominal'} // V.1.0.4
              </p>
              <div className="flex gap-2 ml-2">
                <button 
                  onClick={() => setBloomEnabled(!bloomEnabled)}
                  className={`px-2 py-0.5 border text-[9px] tracking-widest transition-all rounded ${bloomEnabled ? 'bg-blue-500/20 border-blue-400 text-blue-300 shadow-[0_0_10px_rgba(59,130,246,0.3)]' : 'bg-white/5 border-white/10 text-white/40'}`}
                >
                  FX_BLOOM: {bloomEnabled ? 'ON' : 'OFF'}
                </button>
                <button 
                  onClick={() => setAoEnabled(!aoEnabled)}
                  className={`px-2 py-0.5 border text-[9px] tracking-widest transition-all rounded ${aoEnabled ? 'bg-blue-500/20 border-blue-400 text-blue-300 shadow-[0_0_10px_rgba(59,130,246,0.3)]' : 'bg-white/5 border-white/10 text-white/40'}`}
                >
                  FX_AO: {aoEnabled ? 'ON' : 'OFF'}
                </button>
                <button 
                  onClick={() => setShowDocs(true)}
                  className="px-2 py-0.5 border border-white/20 bg-white/5 hover:bg-white/10 text-[9px] tracking-widest transition-colors rounded"
                >
                  HELP
                </button>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col items-end gap-2 font-orbitron">
            <div className="text-[10px] text-white/40 tracking-widest uppercase">Velocity_Output</div>
            <div className="relative w-48 h-2 bg-white/10 rounded-full overflow-hidden border border-white/5">
              <div 
                className={`h-full transition-all duration-75 ${isBoosting ? 'bg-blue-400 shadow-[0_0_15px_rgba(96,165,250,0.8)]' : 'bg-blue-600'}`}
                style={{ width: `${speedPercent}%` }}
              />
            </div>
            <div className="text-xl font-bold text-blue-500/80 tabular-nums">
              {Math.round(speedPercent * 1.8)} <span className="text-[10px] opacity-50">KM/H</span>
            </div>
          </div>
        </div>

        {/* Animation Tester (Left Side) */}
        <div className="absolute top-32 left-6 md:left-10 flex flex-col gap-2 pointer-events-auto max-h-[50vh] overflow-y-auto no-scrollbar max-w-[150px]">
          <div className="text-[10px] font-orbitron text-white/30 tracking-widest uppercase mb-2">Anim_Debugger</div>
          <button 
            onClick={() => setTestAnimation(null)}
            className={`text-left px-3 py-1 text-[10px] font-orbitron border transition-all ${testAnimation === null ? 'bg-blue-500 border-blue-400 text-white shadow-[0_0_15px_rgba(59,130,246,0.4)]' : 'bg-white/5 border-white/10 text-white/50'}`}
          >
            AUTO_SYNC
          </button>
          {availableAnimations.map((name) => (
            <button
              key={name}
              onClick={() => setTestAnimation(name)}
              className={`text-left px-3 py-1 text-[10px] font-orbitron border transition-all ${testAnimation === name ? 'bg-blue-500 border-blue-400 text-white shadow-[0_0_10px_rgba(59,130,246,0.3)]' : 'bg-white/5 border-white/10 text-white/50'}`}
            >
              {name.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Hints / Instructions for Desktop */}
        {!isMobile && (
          <div className="absolute top-1/2 right-10 -translate-y-1/2 flex flex-col gap-4 opacity-40 hover:opacity-100 transition-opacity">
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 p-3 rounded text-[10px] uppercase tracking-tighter w-32">
              <div className="flex justify-between mb-1"><span>FORWARD</span> <span className="text-blue-400">W</span></div>
              <div className="flex justify-between mb-1"><span>BACKWARD</span> <span className="text-blue-400">S</span></div>
              <div className="flex justify-between mb-1"><span>STRAFE</span> <span className="text-blue-400">A/D</span></div>
              <div className="flex justify-between mb-1"><span>BOOST</span> <span className="text-blue-400">SHIFT</span></div>
              <div className="flex justify-between mb-1"><span>JUMP</span> <span className="text-blue-400">SPACE</span></div>
              <div className="flex justify-between"><span>RECENTER</span> <span className="text-blue-400">R</span></div>
            </div>
          </div>
        )}

        {/* Mobile Controls */}
        {isMobile && (
          <div className="flex justify-between items-end pointer-events-auto w-full pb-6">
            <div className="ml-2">
              <Joystick onMove={handleJoystickMove} />
            </div>
            
            <div className="flex flex-col gap-5 mr-2">
              <button 
                onTouchStart={() => controlState.current.run = true}
                onTouchEnd={() => controlState.current.run = false}
                className={`w-16 h-16 rounded-full border-2 backdrop-blur-md flex flex-col items-center justify-center transition-all duration-200 active:scale-90 ${
                  isBoosting 
                    ? 'bg-blue-500/40 border-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.6)]' 
                    : 'bg-white/5 border-white/20'
                }`}
              >
                <div className={`w-1.5 h-1.5 rounded-full mb-1 ${isBoosting ? 'bg-white animate-ping' : 'bg-white/20'}`} />
                <span className={`text-[9px] font-orbitron font-bold tracking-widest ${isBoosting ? 'text-white' : 'text-white/40'}`}>BOOST</span>
              </button>

              <button 
                onTouchStart={handleRecenterPress}
                className="w-16 h-16 bg-white/5 rounded-full border-2 border-white/20 backdrop-blur-md flex items-center justify-center active:bg-white/20 active:scale-90 transition-all shadow-lg"
              >
                <span className="font-orbitron font-bold text-[8px] tracking-widest text-white/60">RECENTER</span>
              </button>
              
              <button 
                onTouchStart={handleJumpPress}
                className="w-20 h-20 bg-blue-600/20 rounded-full border-2 border-blue-500/40 backdrop-blur-md flex items-center justify-center active:bg-blue-500/60 active:scale-95 transition-all shadow-lg"
              >
                <span className="font-orbitron font-bold text-sm tracking-widest text-blue-200">JUMP</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Docs Modal */}
      {showDocs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
          <div className="relative w-full max-w-2xl bg-[#0a0a14] border border-blue-500/30 rounded-lg p-8 shadow-[0_0_50px_rgba(59,130,246,0.2)] max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => setShowDocs(false)}
              className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors"
            >
              [ CLOSE_X ]
            </button>
            
            <h2 className="text-2xl font-orbitron font-bold text-blue-400 mb-6">INTEGRATION_LOGS</h2>
            
            <div className="space-y-6 text-sm leading-relaxed text-white/80">
              <section>
                <h3 className="font-orbitron text-white mb-2 uppercase tracking-widest text-xs border-b border-white/10 pb-1">01. Replace Source</h3>
                <p>Open <code className="text-blue-300">components/GameCanvas.tsx</code> and locate the <code className="text-blue-300">MODEL_URL</code> constant at the top of the file.</p>
                <pre className="mt-2 p-3 bg-black border border-white/5 rounded text-[11px] text-green-400 overflow-x-auto">
                  {`const MODEL_URL = 'https://your-domain.com/character.glb';`}
                </pre>
              </section>

              <section>
                <h3 className="font-orbitron text-white mb-2 uppercase tracking-widest text-xs border-b border-white/10 pb-1">02. Inspect Animations</h3>
                <p>Check the <strong>ANIM_DEBUGGER</strong> panel on the left side of the screen. It lists all available clips found inside your GLB file. Use these buttons to preview them manually.</p>
              </section>

              <section>
                <h3 className="font-orbitron text-white mb-2 uppercase tracking-widest text-xs border-b border-white/10 pb-1">03. Update Logic Mapping</h3>
                <p>Scroll down to the <code className="text-blue-300">animate</code> function in <code className="text-blue-300">GameCanvas.tsx</code>. Update the <code className="text-blue-300">nextAction</code> string names to match your model's specific animation names:</p>
                <pre className="mt-2 p-3 bg-black border border-white/5 rounded text-[11px] text-green-400 overflow-x-auto">
                  {`let nextAction = 'Idle';
if (!isGrounded) nextAction = 'Jump';
else if (speed > 7.0) nextAction = 'Run'; // Rename to match your GLB
else if (speed > 0.5) nextAction = 'Walk';`}
                </pre>
              </section>

              <section className="p-4 bg-blue-500/5 border border-blue-500/20 rounded italic">
                Tip: The engine now includes <strong>UnrealBloomPass</strong> and <strong>SSAOPass</strong>. Ambient Occlusion adds realistic contact shadows where the character meets the ground and in between its mechanical parts.
              </section>
            </div>
          </div>
        </div>
      )}

      {/* Ambient FX Overlays */}
      <div className={`absolute inset-0 pointer-events-none border-[30px] border-blue-500/5 transition-opacity duration-1000 ${isBoosting ? 'opacity-100' : 'opacity-30'} mix-blend-overlay`} />
      
      {isBoosting && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle,transparent_20%,rgba(0,0,0,0.4)_100%)]" />
          <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] animate-pulse" />
        </div>
      )}
      
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />
      <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </div>
  );
};

export default App;
