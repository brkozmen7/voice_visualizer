// ─────────────────────────────────────────────────────────────────────────────
// visualizer.ts — 3D Voice Equalizer  v1.0
// Supports: Microphone | System Audio (screen share) | Both simultaneously
// Calm silk-ribbon background designed for voice assistant UIs.
// ─────────────────────────────────────────────────────────────────────────────

export type AudioSource = 'mic' | 'system' | 'both';

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

  // Background floating bokeh particle field
  private particles: Array<{
    x: number;
    y: number;
    size: number;
    speedX: number;
    speedY: number;
    phase: number;
  }> = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context from canvas');
    this.ctx = ctx;
    this.resize();
    this.initParticles();
  }

  // Handle high-DPI scaling for crisp graphics
  public resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
  }

  // ─── Start ─────────────────────────────────────────────────────────────────

  public async start(sourceType: AudioSource): Promise<void> {
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
        await this.connectMic();
      } else if (sourceType === 'system') {
        await this.connectSystem();
      } else {
        // 'both': connect mic and system in parallel, merge into analyser
        await Promise.all([this.connectMic(), this.connectSystem()]);
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
  private async connectMic(): Promise<void> {
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
      video: false
    });
    this.micNode = this.audioContext!.createMediaStreamSource(this.micStream);
    this.micNode.connect(this.analyser!);
  }

  // Acquire and connect the system audio stream via getDisplayMedia
  private async connectSystem(): Promise<void> {
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
    for (let i = 0; i < this.timeData.length; i++) {
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
    this.stats.vol  = Math.min(1, Math.sqrt(sumSq / this.timeData.length) * s * 1.5);

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
    if (this.isCapturing) {
      this.analyzeAudio();
      // Extremely smooth transitions for all frequency bands to avoid sudden jerks
      const bassAttack = 0.14;
      const bassDecay = 0.03;
      this.smooth.bass = this.smooth.bass + (this.stats.bass - this.smooth.bass) * (this.stats.bass > this.smooth.bass ? bassAttack : bassDecay);
      
      const midAttack = 0.10;
      const midDecay = 0.03;
      this.smooth.mid = this.smooth.mid + (this.stats.mid - this.smooth.mid) * (this.stats.mid > this.smooth.mid ? midAttack : midDecay);
      
      const highAttack = 0.08;
      const highDecay = 0.025;
      this.smooth.high = this.smooth.high + (this.stats.high - this.smooth.high) * (this.stats.high > this.smooth.high ? highAttack : highDecay);
      
      const volAttack = 0.10;
      const volDecay = 0.03;
      this.smooth.vol = this.smooth.vol + (this.stats.vol - this.smooth.vol) * (this.stats.vol > this.smooth.vol ? volAttack : volDecay);
      
      // Ultra-smooth pitch tracking (slow glide effect)
      // When silent, smoothly glide back to 220Hz (neutral reference A3) instead of 0
      const targetPitch = this.stats.pitch > 20 ? this.stats.pitch : 220;
      const pitchSpeed = this.stats.pitch > 20 ? 0.025 : 0.008;
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

    this.updateParticles();
    this.draw();
    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  // ─── Draw ──────────────────────────────────────────────────────────────────

  private draw(): void {
    const dpr = window.devicePixelRatio || 1;
    const width  = this.canvas.width  / dpr;
    const height = this.canvas.height / dpr;

    this.ctx.clearRect(0, 0, width, height);
    
    // Draw dynamic background aura glow and bokeh stardust
    this.drawBackground(width, height);

    this.ctx.globalCompositeOperation = 'screen';

    // Time: gentle base speed + slight vol acceleration
    this.time += 0.007 + this.smooth.vol * 0.014;

    const waveCount = 85;
    // Bass and volume dynamic bounce: lifts the whole ribbon bundle vertically
    const dynamicLift = (this.smooth.bass * -32) + (this.smooth.vol * -12);
    const centerY     = height / 2 + dynamicLift;

    for (let i = 0; i < waveCount; i++) {
      const depth = i / (waveCount - 1); // 0 = back, 1 = front

      const opacity   = 0.05 + depth * 0.40;
      const lineWidth = 0.4  + depth * 1.0;

      // Bass spreads the ribbon layers apart (breathing open/close)
      // In silence, layers draw closer together to form a tight horizontal beam, spreading on sound
      const activeSpread = 0.15 + this.smooth.vol * 0.85;
      const spread  = (1.0 + this.smooth.bass * 0.70) * activeSpread;
      const yOffset = ((depth - 0.5) * 14 + Math.cos(depth * Math.PI) * 32) * spread;
      const xShift  = (depth - 0.5) * 12;

      // Frequency weighting per layer:
      // Back layers pulse more with bass; front layers articulate with mids
      const bassInf = this.smooth.bass * (1.0 - depth * 0.4);
      const midInf  = this.smooth.mid  * (0.4 + Math.sin(depth * Math.PI) * 0.6);
      // Let highs affect more layers than before, but with a balanced scaling
      const highInf = this.smooth.high * (0.1 + depth * 0.7);

      this.setStrokeColor(depth, opacity);
      this.ctx.lineWidth = lineWidth;
      this.ctx.beginPath();

      const pts = 140;
      for (let j = 0; j <= pts; j++) {
        const t = j / pts;

        // Bell-curve envelope: taper smoothly to zero at both edges
        const env = Math.sin(t * Math.PI);

        // Smoothly interpolate the pitch factor toward 1.0 when voice volume dies down to avoid sudden jumps
        const activePitch = this.smooth.pitch > 0 ? this.smooth.pitch : 220;
        const targetFactor = Math.min(1.5, Math.max(0.65, activePitch / 220));
        const voiceActivity = Math.min(1, this.smooth.mid * 5.0 + this.smooth.high * 5.0);
        const pitchFactor = 1.0 + (targetFactor - 1.0) * voiceActivity;

        // Compound wave (triple harmonic) — organic silk feel, pitch-synchronized!
        const freq  = (4.2 + depth * 1.8) * (1.0 + midInf * 0.12) * pitchFactor;
        const phase = this.time * 1.5 + highInf * 0.3 - depth * 11.5;

        let wave = Math.sin(t * freq - phase) * 0.70;
        wave    += Math.sin(t * freq * 1.6 + phase * 1.2) * 0.23;
        wave    += Math.cos(t * freq * 3.3 - phase * 0.7) * 0.07;
        // Dynamically sharpen peaks mainly on bass, with a gentle touch from mids/highs
        const waveExponent = 1.15 + this.smooth.bass * 1.40 + this.smooth.mid * 0.15 + this.smooth.high * 0.25;
        wave = Math.pow(Math.abs(wave), waveExponent) * Math.sign(wave);

        // Balanced mid ripple during speech
        const midRipple  = Math.sin(t * 33 + this.time * 4.3) * midInf  * 18 * Math.sin(depth * Math.PI);
        // Moderate high ripple for crisp but not overly jagged consonants
        const highRipple = Math.sin(t * 78 - this.time * 7) * highInf * 9 * (0.2 + depth * 0.8);
        // Increased bass sway for more dramatic vertical undulations
        const bassSway   = Math.sin(t * 2.0 - this.time * 0.8) * bassInf * 52 * env;

        const ampMult  = 0.35 + Math.sin(depth * Math.PI) * 0.65;
        // Scale the base height with volume so it lies almost perfectly flat in silence
        const baseH    = (8 + depth * 14) * ampMult * (0.04 + this.smooth.vol * 0.96);
        const bassAmp  = bassInf * 260 * ampMult;
        const midAmp   = midInf * 85 * ampMult;
        const highAmp  = highInf * 28 * ampMult;
        const amp      = (baseH + bassAmp + midAmp + highAmp) * env;

        const y = centerY + yOffset + wave * amp + (midRipple + highRipple) * env + bassSway;
        const x = t * width + xShift;

        j === 0 ? this.ctx.moveTo(x, y) : this.ctx.lineTo(x, y);
      }

      this.ctx.stroke();
    }

    this.ctx.globalCompositeOperation = 'source-over';
  }

  // ─── Colors ────────────────────────────────────────────────────────────────

  private setStrokeColor(depth: number, opacity: number): void {
    if (this.style === 'classic') {
      const blue = Math.floor(240 + (1 - depth) * 15);
      const rg   = Math.floor(245 + depth * 10);
      this.ctx.strokeStyle = `rgba(${rg},${rg},${blue},${opacity})`;
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const cy  = (this.canvas.height / dpr) / 2;
    const maxH = 45 + this.smooth.bass * 95;
    const grad = this.ctx.createLinearGradient(0, cy - maxH, 0, cy + maxH);
    // Smoothly fade out the hue shift when voice activity drops to prevent color snaps
    const voiceActivity = Math.min(1, this.smooth.mid * 5.0 + this.smooth.high * 5.0);
    const targetHueShift = this.smooth.pitch > 0 
      ? Math.min(35, Math.max(0, (this.smooth.pitch - 100) * 0.08)) 
      : 0;
    const pitchHueShift = targetHueShift * voiceActivity;
    const ds   = depth * 15 + pitchHueShift; // per-layer hue shift + pitch shift

    switch (this.style) {
      case 'neon':
        grad.addColorStop(0,   `hsla(${187+ds},    100%, 55%, ${opacity})`);
        grad.addColorStop(0.5, `hsla(${270-ds*0.5}, 85%, 45%, ${opacity})`);
        grad.addColorStop(1,   `hsla(${187+ds},    100%, 55%, ${opacity})`);
        break;
      case 'sunset':
        grad.addColorStop(0,   `hsla(${340+ds*0.3}, 100%, 55%, ${opacity})`);
        grad.addColorStop(0.5, `hsla(${15+ds*0.4},  100%, 50%, ${opacity})`);
        grad.addColorStop(1,   `hsla(${340+ds*0.3}, 100%, 55%, ${opacity})`);
        break;
      case 'cyber':
        grad.addColorStop(0,   `hsla(${325+ds*0.3}, 100%, 55%, ${opacity})`);
        grad.addColorStop(0.5, `hsla(${120-ds*0.3}, 100%, 50%, ${opacity})`);
        grad.addColorStop(1,   `hsla(${325+ds*0.3}, 100%, 55%, ${opacity})`);
        break;
      case 'gold':
        grad.addColorStop(0,   `hsla(${48+ds*0.2},  100%, 55%, ${opacity})`);
        grad.addColorStop(0.5, `hsla(${30-ds*0.3},   90%, 35%, ${opacity})`);
        grad.addColorStop(1,   `hsla(${48+ds*0.2},  100%, 55%, ${opacity})`);
        break;
    }

    this.ctx.strokeStyle = grad;
  }

  // ─── Background & Particles (Bokeh Field) ──────────────────────────────────

  private initParticles(): void {
    this.particles = [];
    const count = 45;
    for (let i = 0; i < count; i++) {
      const size = Math.random() * 3.2 + 0.8;
      this.particles.push({
        x: Math.random(),
        y: Math.random(),
        size: size,
        speedX: (Math.random() - 0.5) * 0.0003,
        speedY: (Math.random() - 0.5) * 0.0003,
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  private updateParticles(): void {
    // Extremely slow drift in silence (0.12), speeding up dynamically on sound
    const s = 0.12 + this.smooth.vol * 4.2;
    for (const p of this.particles) {
      // 3D Parallax: Larger particles drift faster because they are "closer"
      const sizeFactor = p.size / 3.2;
      p.x += p.speedX * s * sizeFactor;
      p.y += p.speedY * s * sizeFactor;

      // Wrap around bounds
      if (p.x < 0) p.x += 1;
      if (p.x > 1) p.x -= 1;
      if (p.y < 0) p.y += 1;
      if (p.y > 1) p.y -= 1;
    }
  }

  private drawBackground(width: number, height: number): void {
    // 1. Dynamic Radial Ambient Aura Glow
    const centerY = height / 2 + (this.smooth.bass * -32);
    const radius = Math.min(width, height) * (0.42 + this.smooth.bass * 0.18);

    let hue = 225;
    let sat = "40%";
    let light = "8%";

    const pitchHueShift = this.smooth.pitch > 0 
      ? Math.min(35, Math.max(0, (this.smooth.pitch - 100) * 0.08)) 
      : 0;

    if (this.style === 'classic') {
      hue = 225; sat = "20%"; light = "6%";
    } else if (this.style === 'neon') {
      hue = 187 + pitchHueShift; sat = "80%"; light = "10%";
    } else if (this.style === 'sunset') {
      hue = 340 + pitchHueShift * 0.3; sat = "80%"; light = "8%";
    } else if (this.style === 'cyber') {
      hue = 120 - pitchHueShift * 0.3; sat = "75%"; light = "6%";
    } else if (this.style === 'gold') {
      hue = 42 + pitchHueShift * 0.2; sat = "65%"; light = "7%";
    }

    const auraOpacity = 0.07 + this.smooth.vol * 0.15;

    const grad = this.ctx.createRadialGradient(width / 2, centerY, 5, width / 2, centerY, radius);
    grad.addColorStop(0, `hsla(${hue}, ${sat}, ${light}, ${auraOpacity})`);
    grad.addColorStop(1, `rgba(2, 3, 5, 0)`);

    this.ctx.fillStyle = grad;
    this.ctx.fillRect(0, 0, width, height);

    // 2. Outer Dynamic Vignette (Pulses to create cinematic breathing)
    const vignetteGrad = this.ctx.createRadialGradient(
      width / 2, height / 2, Math.min(width, height) * 0.35,
      width / 2, height / 2, Math.max(width, height) * 0.75
    );
    const vignetteOpacity = Math.min(0.92, 0.86 - this.smooth.vol * 0.12);
    vignetteGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignetteGrad.addColorStop(1, `rgba(2, 3, 5, ${vignetteOpacity})`);
    
    this.ctx.fillStyle = vignetteGrad;
    this.ctx.fillRect(0, 0, width, height);

    // 3. Glowing Bokeh Particles (Floating Stardust with 3D Parallax & Size-Based Transparency)
    let pFill = 'rgba(255, 255, 255, ';
    if (this.style === 'neon') pFill = 'rgba(0, 242, 254, ';
    else if (this.style === 'sunset') pFill = 'rgba(255, 8, 68, ';
    else if (this.style === 'cyber') pFill = 'rgba(57, 255, 20, ';
    else if (this.style === 'gold') pFill = 'rgba(255, 215, 0, ';

    this.ctx.globalCompositeOperation = 'screen';
    for (const p of this.particles) {
      const px = p.x * width;
      const py = p.y * height;

      // 3D Parallax: Larger particles (closer to camera) sway wider
      const sizeFactor = p.size / 3.2;
      const swayX = Math.sin(this.time * 0.4 + p.phase) * 12 * sizeFactor * (1.0 + this.smooth.mid);
      const swayY = Math.cos(this.time * 0.3 + p.phase) * 12 * sizeFactor * (1.0 + this.smooth.bass);

      // Real lens bokeh approximation: Larger particles are blurred/dimmer (lower base opacity)
      // while smaller particles are sharp/bright
      const baseParticleOpacity = 0.04 + (1.0 - sizeFactor) * 0.18;
      const volPulse = this.smooth.vol * 0.35;
      const opacity = Math.min(0.70, baseParticleOpacity + volPulse + Math.sin(this.time * 0.8 + p.phase * 4) * 0.05);

      this.ctx.beginPath();
      this.ctx.arc(px + swayX, py + swayY, p.size, 0, Math.PI * 2);
      this.ctx.fillStyle = pFill + `${opacity})`;
      this.ctx.fill();
    }
  }
}
