// ─────────────────────────────────────────────────────────────────────────────
// visualizer.ts — 3D Voice Equalizer  v1.1 (Performance Edition)
// Supports: Microphone | System Audio (screen share) | Both simultaneously
// Calm silk-ribbon background designed for voice assistant UIs.
// ─────────────────────────────────────────────────────────────────────────────

export type AudioSource = 'mic' | 'system' | 'both';

declare global {
  interface Window {
    electronAPI?: {
      getDesktopSourceId: () => Promise<string | null>;
    };
  }
}

export class VoiceVisualizer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // A single shared AudioContext + AnalyserNode
  // When 'both' is selected, mic and system streams are merged via a
  // ChannelMergerNode before hitting the analyser.
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;

  // Up to two active streams (mic + system)
  private micStream: MediaStream | null = null;
  private systemStream: MediaStream | null = null;
  private micNode: MediaStreamAudioSourceNode | null = null;
  private systemNode: MediaStreamAudioSourceNode | null = null;

  private frequencyData: Uint8Array = new Uint8Array(0);
  private timeData: Uint8Array = new Uint8Array(0);

  // Public state
  public isCapturing: boolean = false;
  public sensitivity: number = 1.5;
  public style: 'classic' | 'neon' | 'sunset' | 'cyber' | 'gold' = 'classic';

  // Raw frequency-band levels (exposed for UI stats panel)
  public stats = { bass: 0, mid: 0, high: 0, vol: 0, pitch: 0 };

  // Internally smoothed values used by the renderer
  private smooth = { bass: 0, mid: 0, high: 0, vol: 0, pitch: 0 };

  private animationFrameId: number = 0;
  private time: number = 0;

  // Silence & standby dot mode state
  private silenceTimer: number = 0;
  private isSilentMode: boolean = false;
  private morphFactor: number = 1.0;
  private lastTime: number = performance.now();

  // Background particle field removed for performance

  // ─── Performance caches ────────────────────────────────────────────────────
  // Cached logical canvas dimensions (updated on resize, avoids per-frame division)
  private cachedWidth: number  = 0;
  private cachedHeight: number = 0;

  // Per-frame gradient cache: one CanvasGradient reused across all 45 wave draws
  // for colored styles. Avoids 45 createLinearGradient calls per frame (major win).
  private _gradCache: CanvasGradient | null = null;
  private _gradCacheStyle: string = '';
  private _gradCacheMaxH: number  = -1;
  private _gradCacheCy: number    = -1;
  private _gradCachePitchShift: number = -1;

  // Pre-allocated typed arrays for inner-loop envelope / t / sine computations
  private _envCache: Float32Array = new Float32Array(76);
  private _tCache: Float32Array   = new Float32Array(76);
  private _midSinCache: Float32Array = new Float32Array(76);
  private _highSinCache: Float32Array = new Float32Array(76);
  private _bassSinCache: Float32Array = new Float32Array(76);

  // Idle-mode FPS throttle: only draw ~20fps when no audio is active (saves ~66% GPU on RPi)
  private _lastFrameTime: number = 0;
  private static readonly IDLE_FRAME_MS = 50; // ~20fps

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    // alpha:false tells the browser the canvas has no transparency, enabling
    // GPU-side optimisations (skip alpha compositing of the canvas element itself)
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Could not get 2D context from canvas');
    this.ctx = ctx;
    this.resize();

  }

  // Handle high-DPI scaling for crisp graphics
  public resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    
    // For Raspberry Pi / low-spec CPU rendering, we cap the maximum physical rendering width/height at 1280x720.
    // CSS handles upscaling to full-screen kiosk smoothly using hardware compositing.
    const maxRenderWidth = 1280;
    const maxRenderHeight = 720;
    
    let dpr = window.devicePixelRatio || 1;
    let physWidth = rect.width * dpr;
    let physHeight = rect.height * dpr;
    
    if (physWidth > maxRenderWidth || physHeight > maxRenderHeight) {
      const scaleX = maxRenderWidth / rect.width;
      const scaleY = maxRenderHeight / rect.height;
      dpr = Math.min(scaleX, scaleY);
      physWidth = rect.width * dpr;
      physHeight = rect.height * dpr;
    }
    
    this.canvas.width  = Math.floor(physWidth);
    this.canvas.height = Math.floor(physHeight);
    this.ctx.scale(dpr, dpr);
    
    // Cache logical dimensions so draw() never needs to divide by dpr each frame
    this.cachedWidth  = rect.width;
    this.cachedHeight = rect.height;
    // Invalidate gradient cache after any resize
    this._gradCache = null;
  }

  // ─── Start ─────────────────────────────────────────────────────────────────

  public async start(sourceType: AudioSource, deviceId?: string): Promise<void> {
    this.stop(); // tear down previous session first

    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.82;

      const bufferLength = this.analyser.frequencyBinCount;
      this.frequencyData = new Uint8Array(bufferLength);
      this.timeData = new Uint8Array(bufferLength);

      if (sourceType === 'mic') {
        await this.connectMic(deviceId);
      } else if (sourceType === 'system') {
        if (deviceId && deviceId !== 'screen-share' && deviceId !== 'default') {
          await this.connectSystemViaDevice(deviceId);
        } else {
          await this.connectSystem();
        }
      } else {
        // 'both': connect mic and system in parallel, merge into analyser
        await Promise.all([
          this.connectMic('default'),
          deviceId && deviceId !== 'screen-share' && deviceId !== 'default' 
            ? this.connectSystemViaDevice(deviceId) 
            : this.connectSystem()
        ]);
      }

      this.isCapturing = true;
      this.loop();
    } catch (err) {
      this.isCapturing = false;
      this.stop();
      throw err;
    }
  }

  // Acquire and connect the microphone stream
  private async connectMic(deviceId?: string): Promise<void> {
    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false
    };
    if (deviceId && deviceId !== 'default' && deviceId !== 'screen-share') {
      audioConstraints.deviceId = { exact: deviceId };
    }
    
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false
      });
    } catch (err) {
      console.warn(`Failed to connect to device ${deviceId}, trying default microphone`, err);
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
        video: false
      });
    }
    
    this.micNode = this.audioContext!.createMediaStreamSource(this.micStream);
    this.micNode.connect(this.analyser!);
  }

  // Acquire and connect the system audio stream via direct device loopback
  private async connectSystemViaDevice(deviceId: string): Promise<void> {
    this.systemStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: deviceId },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      },
      video: false
    });
    this.systemNode = this.audioContext!.createMediaStreamSource(this.systemStream);
    this.systemNode.connect(this.analyser!);
  }

  // Acquire and connect the system audio stream via getDisplayMedia
  private async connectSystem(): Promise<void> {
    // If running in Electron, auto-capture primary display audio to bypass picker prompts
    if (window.electronAPI && window.electronAPI.getDesktopSourceId) {
      try {
        const sourceId = await window.electronAPI.getDesktopSourceId();
        if (sourceId) {
          this.systemStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: sourceId
              }
            } as any,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: sourceId,
                maxHeight: 1,
                maxWidth: 1
              }
            } as any
          });

          const audioTracks = this.systemStream.getAudioTracks();
          if (audioTracks.length > 0) {
            this.systemNode = this.audioContext!.createMediaStreamSource(this.systemStream);
            this.systemNode.connect(this.analyser!);
            return;
          }
        }
      } catch (err) {
        console.warn('Electron auto-capture failed, falling back to standard getDisplayMedia', err);
      }
    }

    // Standard Browser / Fallback
    this.systemStream = await navigator.mediaDevices.getDisplayMedia({
      video: { width: 1, height: 1 },
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });

    const audioTracks = this.systemStream.getAudioTracks();
    if (audioTracks.length === 0) {
      this.systemStream.getTracks().forEach(t => t.stop());
      this.systemStream = null;
      throw new Error(
        'Sistem sesi bulunamadı. Lütfen "Ekran Paylaş" seçeneğinde "Sistem sesini paylaş" kutusunu işaretleyin.'
      );
    }

    this.systemNode = this.audioContext!.createMediaStreamSource(this.systemStream);
    this.systemNode.connect(this.analyser!);
  }

  // ─── Stop ──────────────────────────────────────────────────────────────────

  public stop(): void {
    this.isCapturing = false;

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = 0;
    }

    this.micNode?.disconnect();
    this.micNode = null;
    this.systemNode?.disconnect();
    this.systemNode = null;

    this.micStream?.getTracks().forEach(t => t.stop());
    this.micStream = null;
    this.systemStream?.getTracks().forEach(t => t.stop());
    this.systemStream = null;

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
    this.audioContext = null;
    this.analyser = null;

    this.stats.bass = 0;
    this.stats.mid = 0;
    this.stats.high = 0;
    this.stats.vol = 0;

    // Continue rendering idle animation
    this.loop();
  }

  // ─── Audio Analysis ────────────────────────────────────────────────────────

  private analyzeAudio(): void {
    if (!this.analyser) return;

    this.analyser.getByteFrequencyData(this.frequencyData as any);
    this.analyser.getByteTimeDomainData(this.timeData as any);

    // Bass  : 0–6 bins  (~20–258 Hz)   — pure deep sub-bass/kick range
    let bassSum = 0;
    const bassBins = 6;
    for (let i = 0; i < bassBins; i++) bassSum += this.frequencyData[i];

    // Mid   : 16–100 bins (~690 Hz–4.3 kHz) — voice fundamentals + harmonics
    let midSum = 0;
    for (let i = 16; i < 100; i++) midSum += this.frequencyData[i];

    // High  : 100–250 bins (~4.3–10.7 kHz) — sibilance, consonants, brightness
    let highSum = 0;
    for (let i = 100; i < 250; i++) highSum += this.frequencyData[i];

    // RMS volume from time domain (truest loudness measure)
    let sumSq = 0;
    const tdLen = this.timeData.length; // cache property to avoid repeated lookup
    for (let i = 0; i < tdLen; i++) {
      const n = (this.timeData[i] - 128) / 128;
      sumSq += n * n;
    }

    const s = this.sensitivity;
    // Apply a threshold and reduce sensitivity by ~75% to only capture strong bass peaks
    const rawBass = bassSum / bassBins / 255;
    const bassThreshold = 0.30;
    const peakBass = Math.max(0, rawBass - bassThreshold) / (1 - bassThreshold);
    this.stats.bass = Math.min(1, Math.pow(peakBass, 1.6) * s * 0.35);
    this.stats.mid  = Math.min(1, (midSum  / 84 / 255) * s);
    // Moderate boost for high frequencies to catch consonants without being overly erratic
    this.stats.high = Math.min(1, (highSum / 150 / 255) * s * 1.6);
    this.stats.vol  = Math.min(1, Math.sqrt(sumSq / tdLen) * s * 1.5);

    // Detect dominant frequency (vocal pitch) between ~80Hz and ~1200Hz
    let maxVal = 0;
    let maxBin = 0;
    const startBin = 2;  // ~86Hz
    const endBin = 30;   // ~1290Hz
    for (let i = startBin; i < endBin; i++) {
      if (this.frequencyData[i] > maxVal) {
        maxVal = this.frequencyData[i];
        maxBin = i;
      }
    }
    const sampleRate = this.audioContext?.sampleRate || 44100;
    const fftSize = this.analyser?.fftSize || 1024;
    const rawPitch = maxVal > 30 ? maxBin * (sampleRate / fftSize) : 0;

    // Smooth stats.pitch directly so both UI text/bar and drawing use the same organic glide
    if (rawPitch > 0) {
      if (this.stats.pitch === 0) {
        this.stats.pitch = rawPitch;
      } else {
        this.stats.pitch = this.stats.pitch + (rawPitch - this.stats.pitch) * 0.08;
      }
    } else {
      this.stats.pitch = this.stats.pitch + (0 - this.stats.pitch) * 0.035;
      if (this.stats.pitch < 5) this.stats.pitch = 0;
    }
  }

  /** Asymmetric lerp: quick attack when sound rises, slow decay when it falls */
  private lerp(cur: number, target: number): number {
    return cur + (target - cur) * (target > cur ? 0.28 : 0.048);
  }

  // ─── Render Loop ───────────────────────────────────────────────────────────

  private loop = (): void => {
    // ── Idle & Silent FPS throttle ──────────────────────────────────────────
    // When not capturing OR when completely silent (morphed to nothingness),
    // cap render rate at ~20fps to save CPU/GPU on Raspberry Pi.
    const isMorphedSilent = this.isCapturing && this.morphFactor === 0;
    if (!this.isCapturing || isMorphedSilent) {
      const now = performance.now();
      if (now - this._lastFrameTime < VoiceVisualizer.IDLE_FRAME_MS) {
        this.animationFrameId = requestAnimationFrame(this.loop);
        return;
      }
      this._lastFrameTime = now;
    }

    // Compute delta time for smooth, frame-rate independent animations
    const nowFrame = performance.now();
    const dt = Math.min(0.1, (nowFrame - this.lastTime) / 1000); // Cap at 100ms to handle screen suspension
    this.lastTime = nowFrame;

    if (this.isCapturing) {
      this.analyzeAudio();
      // Balanced coefficients for silky-smooth wave transition and fluid movement
      const bassAttack = 0.22;
      const bassDecay = 0.08;
      this.smooth.bass = this.smooth.bass + (this.stats.bass - this.smooth.bass) * (this.stats.bass > this.smooth.bass ? bassAttack : bassDecay);
      
      const midAttack = 0.20;
      const midDecay = 0.07;
      this.smooth.mid = this.smooth.mid + (this.stats.mid - this.smooth.mid) * (this.stats.mid > this.smooth.mid ? midAttack : midDecay);
      
      const highAttack = 0.20;
      const highDecay = 0.07;
      this.smooth.high = this.smooth.high + (this.stats.high - this.smooth.high) * (this.stats.high > this.smooth.high ? highAttack : highDecay);
      
      const volAttack = 0.20;
      const volDecay = 0.07;
      this.smooth.vol = this.smooth.vol + (this.stats.vol - this.smooth.vol) * (this.stats.vol > this.smooth.vol ? volAttack : volDecay);
      
      // Responsive but smoothed pitch tracking
      const targetPitch = this.stats.pitch > 20 ? this.stats.pitch : 220;
      const pitchSpeed = this.stats.pitch > 20 ? 0.08 : 0.04;
      this.smooth.pitch = this.smooth.pitch + (targetPitch - this.smooth.pitch) * pitchSpeed;
    } else {
      // Idle: gentle breathing so ribbons never look static
      const breathe = Math.sin(this.time * 0.55) * 0.5 + 0.5;
      const breathe2 = Math.sin(this.time * 0.85 + 1.2) * 0.5 + 0.5;
      this.smooth.bass = this.lerp(this.smooth.bass, 0.025 + breathe  * 0.030);
      this.smooth.mid  = this.lerp(this.smooth.mid,  0.018 + breathe2 * 0.022);
      this.smooth.high = this.lerp(this.smooth.high, 0.010 + breathe  * 0.012);
      this.smooth.vol  = this.lerp(this.smooth.vol,  0.012 + breathe2 * 0.015);
      this.smooth.pitch = this.smooth.pitch + (220 - this.smooth.pitch) * 0.008;
      // Decay raw stats to 0
      this.stats.bass *= 0.94;
      this.stats.mid  *= 0.94;
      this.stats.high *= 0.94;
      this.stats.vol  *= 0.94;
      this.stats.pitch *= 0.90;
    }

    // Silence detection: volume threshold < 2% (0.02)
    const currentVol = this.isCapturing ? this.stats.vol : 0;
    if (currentVol < 0.02) {
      this.silenceTimer += dt;
      if (this.silenceTimer >= 10.0) {
        this.isSilentMode = true;
      }
    } else {
      this.silenceTimer = 0;
      this.isSilentMode = false;
    }

    // Update morphFactor: morphs into a point in ~2.1s with organic ease-out, expands back in 100ms
    if (this.isSilentMode) {
      this.morphFactor = this.morphFactor * Math.exp(-dt * 2.2);
      if (this.morphFactor < 0.005) {
        this.morphFactor = 0;
      }
    } else {
      this.morphFactor = Math.min(1.0, this.morphFactor + dt / 0.10);
    }

    this.draw();
    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  // ─── Draw ──────────────────────────────────────────────────────────────────

  private draw(): void {
    const width  = this.cachedWidth;
    const height = this.cachedHeight;

    this.ctx.clearRect(0, 0, width, height);

    // Time: constant gentle base speed + organic volume acceleration
    this.time += 0.008 + this.smooth.vol * 0.006;

    // Bass and volume dynamic bounce: lifts the whole ribbon bundle vertically
    const dynamicLift = (this.smooth.bass * -32) + (this.smooth.vol * -12);
    const centerY     = height / 2 + dynamicLift;

    // Early return if completely silent / morphed to save 100% CPU
    if (this.morphFactor < 0.005) {
      return;
    }

    this.ctx.globalCompositeOperation = 'screen';

    const waveCount = 10; // Optimized for RPi CPU-only rendering (down from 16)
    const pts = 36;       // Optimized for RPi CPU-only rendering (down from 45)

    // Pre-calculate repeating sine and envelope math once per frame
    const envCache  = this._envCache;
    const tCache    = this._tCache;
    const midCache  = this._midSinCache;
    const highCache = this._highSinCache;
    const bassCache = this._bassSinCache;

    const midTime = this.time * 4.3;
    const highTime = this.time * -7.0;
    const bassTime = this.time * -0.8;

    for (let j = 0; j <= pts; j++) {
      const t = j / pts;
      tCache[j]   = t;
      envCache[j] = Math.sin(t * Math.PI);
      midCache[j]  = Math.sin(t * 33 + midTime);
      highCache[j] = Math.sin(t * 78 + highTime);
      bassCache[j] = Math.sin(t * 2.0 + bassTime);
    }

    // Precalculate frame-level voice & pitch variables (moved out of inner loops for 90% CPU savings)
    const activePitch = this.smooth.pitch > 0 ? this.smooth.pitch : 220;
    const targetFactor = Math.min(1.5, Math.max(0.65, activePitch / 220));
    const voiceActivity = Math.min(1, this.smooth.mid * 5.0 + this.smooth.high * 5.0);
    const pitchFactor = 1.0 + (targetFactor - 1.0) * voiceActivity;
    const waveExponent = 1.15 + this.smooth.bass * 1.40 + this.smooth.mid * 0.15 + this.smooth.high * 0.25;
    
    // Scale down wave amplitude on portrait screens to avoid crowding the widgets
    const isPortrait = height > width;
    const ampScale = isPortrait ? 0.65 : 1.0;

    const activeSpread = 0.15 + this.smooth.vol * 0.85;
    const spread  = (1.0 + this.smooth.bass * 0.70) * activeSpread;

    // ── Build one shared gradient per frame for colored styles ─────────────
    const isClassic = this.style === 'classic';
    if (!isClassic) {
      const maxH          = 45 + this.smooth.bass * 95;
      const pitchHueShift = this.smooth.pitch > 0
        ? Math.min(35, Math.max(0, (this.smooth.pitch - 100) * 0.08))
        : 0;
      // Only recreate gradient when defining parameters change meaningfully
      const needsRebuild =
        this._gradCache === null ||
        this._gradCacheStyle !== this.style ||
        Math.abs(this._gradCacheMaxH - maxH) > 1 ||
        Math.abs(this._gradCacheCy - centerY) > 1 ||
        Math.abs(this._gradCachePitchShift - pitchHueShift) > 0.5;

      if (needsRebuild) {
        const grad = this.ctx.createLinearGradient(0, centerY - maxH, 0, centerY + maxH);
        switch (this.style) {
          case 'neon':
            grad.addColorStop(0,   `hsl(${187 + pitchHueShift},        100%, 55%)`);
            grad.addColorStop(0.5, `hsl(${270 - pitchHueShift * 0.5},   85%, 45%)`);
            grad.addColorStop(1,   `hsl(${187 + pitchHueShift},        100%, 55%)`);
            break;
          case 'sunset':
            grad.addColorStop(0,   `hsl(${340 + pitchHueShift * 0.3}, 100%, 55%)`);
            grad.addColorStop(0.5, `hsl(${15  + pitchHueShift * 0.4}, 100%, 50%)`);
            grad.addColorStop(1,   `hsl(${340 + pitchHueShift * 0.3}, 100%, 55%)`);
            break;
          case 'cyber':
            grad.addColorStop(0,   `hsl(${325 + pitchHueShift * 0.3}, 100%, 55%)`);
            grad.addColorStop(0.5, `hsl(${120 - pitchHueShift * 0.3}, 100%, 50%)`);
            grad.addColorStop(1,   `hsl(${325 + pitchHueShift * 0.3}, 100%, 55%)`);
            break;
          case 'gold':
            grad.addColorStop(0,   `hsl(${48  + pitchHueShift * 0.2}, 100%, 55%)`);
            grad.addColorStop(0.5, `hsl(${30  - pitchHueShift * 0.3},  90%, 35%)`);
            grad.addColorStop(1,   `hsl(${48  + pitchHueShift * 0.2}, 100%, 55%)`);
            break;
        }
        this._gradCache          = grad;
        this._gradCacheStyle     = this.style;
        this._gradCacheMaxH      = maxH;
        this._gradCacheCy        = centerY;
        this._gradCachePitchShift = pitchHueShift;
      }
    }

    for (let i = 0; i < waveCount; i++) {
      const depth = i / (waveCount - 1); // 0 = back, 1 = front

      // Thicker lines and slightly higher opacities to make 10 waves look full and premium
      const opacity   = (0.12 + depth * 0.58) * this.morphFactor; 
      const lineWidth = 1.0 + depth * 2.5;   

      // Bass spreads the ribbon layers apart (breathing open/close)
      const yOffset = ((depth - 0.5) * 14 + Math.cos(depth * Math.PI) * 32) * spread;
      const xShift  = (depth - 0.5) * 12;

      // Frequency weighting per layer:
      const bassInf = this.smooth.bass * (1.0 - depth * 0.4);
      const midInf  = this.smooth.mid  * (0.4 + Math.sin(depth * Math.PI) * 0.6);
      const highInf = this.smooth.high * (0.1 + depth * 0.7);

      const freq  = (4.2 + depth * 1.8) * (1.0 + midInf * 0.12) * pitchFactor;
      const phase = this.time * 1.5 + highInf * 0.3 - depth * 11.5;

      const ampMult  = 0.35 + Math.sin(depth * Math.PI) * 0.65;
      const baseH    = (8 + depth * 14) * ampMult * (0.04 + this.smooth.vol * 0.96) * ampScale;
      const bassAmp  = bassInf * 260 * ampMult * ampScale;
      const midAmp   = midInf * 85 * ampMult * ampScale;
      const highAmp  = highInf * 28 * ampMult * ampScale;
      const amp      = (baseH + bassAmp + midAmp + highAmp);

      const sinDepthPI = Math.sin(depth * Math.PI);
      const highFactor = 0.2 + depth * 0.8;

      // Set stroke — classic uses per-wave rgba; colored themes reuse cached gradient + globalAlpha
      if (isClassic) {
        const blue = Math.floor(240 + (1 - depth) * 15);
        const rg   = Math.floor(245 + depth * 10);
        this.ctx.strokeStyle = `rgba(${rg},${rg},${blue},${opacity})`;
      } else {
        this.ctx.globalAlpha = opacity;
        this.ctx.strokeStyle = this._gradCache!;
      }
      this.ctx.lineWidth = lineWidth;
      this.ctx.beginPath();

      for (let j = 0; j <= pts; j++) {
        const t   = tCache[j];
        const env = envCache[j];

        // Compound wave (triple harmonic) — organic silk feel, pitch-synchronized!
        let wave = Math.sin(t * freq - phase) * 0.70;
        wave    += Math.sin(t * freq * 1.6 + phase * 1.2) * 0.23;
        wave    += Math.cos(t * freq * 3.3 - phase * 0.7) * 0.07;
        wave = Math.pow(Math.abs(wave), waveExponent) * (wave < 0 ? -1 : 1);

        // Balanced mid ripple during speech (utilizing precalculated sines)
        const midRipple  = midCache[j] * midInf  * 18 * sinDepthPI;
        // Moderate high ripple (utilizing precalculated sines)
        const highRipple = highCache[j] * highInf * 9 * highFactor;
        // Increased bass sway (utilizing precalculated sines)
        const bassSway   = bassCache[j] * bassInf * 52 * env;

        const originalY = centerY + yOffset + wave * amp * env + (midRipple + highRipple) * env + bassSway;
        const originalX = t * width + xShift;

        // Morph coordinates towards the center
        const x = width / 2 + (originalX - width / 2) * this.morphFactor;
        const y = centerY + (originalY - centerY) * this.morphFactor;

        j === 0 ? this.ctx.moveTo(x, y) : this.ctx.lineTo(x, y);
      }

      this.ctx.stroke();
    }

    // Restore globalAlpha to 1 after colored-theme wave pass
    if (!isClassic) {
      this.ctx.globalAlpha = 1;
    }

    this.ctx.globalCompositeOperation = 'source-over';
  }
}
