// SOLMAR audio — all sounds synthesized live with WebAudio, no files.
// The context is created lazily on the first user gesture so the game
// never tries to play before the browser allows sound. Every public
// method is safe to call at any time and never throws.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenOn = false;
  let sirenTimer = null;
  let musicTimer = null;
  let musicStep = 0;
  let started = false;

  // 16-step bass line (Hz, 0 = rest) — a low, driving groove.
  const bassNotes = [55, 0, 55, 65.41, 0, 55, 0, 49, 55, 0, 55, 65.41, 73.42, 0, 65.41, 49];
  // 16-step plucked lead (Hz, 0 = rest) — sparse golden-hour melody.
  const leadNotes = [220, 0, 261.63, 0, 329.63, 0, 261.63, 0, 220, 0, 293.66, 0, 329.63, 392, 0, 0];

  function ensureCtx() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  function ensureEngine() {
    if (!ctx || engineOsc) return;
    try {
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 60;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
    } catch (e) {
      engineOsc = null;
    }
  }

  function ensureSiren() {
    if (!ctx || sirenOsc) return;
    try {
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
    } catch (e) {
      sirenOsc = null;
    }
  }

  // Short pitched blip. `slide` (Hz) bends the pitch over the note.
  function tone(freq, duration, wave, volume, slide) {
    if (muted || !ctx || !master) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = wave || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + duration);
      gain.gain.setValueAtTime(volume || 0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + duration + 0.02);
    } catch (e) { /* audio must never break the game */ }
  }

  // Burst of filtered noise, for shots, crashes and hats.
  function noise(duration, volume, filterFreq) {
    if (muted || !ctx || !master) return;
    try {
      const t = ctx.currentTime;
      const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq || 1200;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume || 0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start(t);
    } catch (e) { /* audio must never break the game */ }
  }

  function startMusic() {
    if (musicTimer || !ctx) return;
    musicTimer = setInterval(() => {
      if (muted || !ctx) return;
      try {
        const bass = bassNotes[musicStep % 16];
        const lead = leadNotes[musicStep % 16];
        if (bass) tone(bass, 0.22, 'triangle', 0.16);
        if (lead) tone(lead, 0.16, 'square', 0.05);
        if (musicStep % 4 === 0) noise(0.04, 0.05, 6000);
      } catch (e) { /* keep the loop alive */ }
      musicStep = (musicStep + 1) % 16;
    }, 190);
  }

  function unlock() {
    try {
      const c = ensureCtx();
      if (!c) return;
      if (c.resume) c.resume();
      ensureEngine();
      ensureSiren();
      if (!started) {
        started = true;
        startMusic();
      }
    } catch (e) { /* never throw */ }
  }

  function setMuted(value) {
    muted = !!value;
    try {
      if (master) master.gain.value = muted ? 0 : 0.5;
    } catch (e) { /* never throw */ }
  }

  function isMuted() {
    return muted;
  }

  // ratio 0..1 = speed fraction; driving false silences the hum.
  function setEngine(ratio, driving) {
    try {
      if (!ctx) return;
      ensureEngine();
      if (!engineOsc || !engineGain) return;
      const r = Math.max(0, Math.min(1, ratio || 0));
      const t = ctx.currentTime;
      const target = driving && !muted ? 0.03 + r * 0.09 : 0;
      engineGain.gain.setTargetAtTime(target, t, 0.08);
      engineOsc.frequency.setTargetAtTime(55 + r * 130, t, 0.08);
    } catch (e) { /* never throw */ }
  }

  // Two-tone wail while the player is wanted; off otherwise.
  function setSiren(on) {
    try {
      if (!ctx) return;
      ensureSiren();
      if (!sirenOsc || !sirenGain) return;
      if (on && !sirenOn) {
        sirenOn = true;
        let high = false;
        sirenTimer = setInterval(() => {
          if (muted || !sirenOn || !sirenOsc) return;
          high = !high;
          sirenOsc.frequency.setTargetAtTime(high ? 950 : 700, ctx.currentTime, 0.05);
        }, 420);
        sirenGain.gain.setTargetAtTime(muted ? 0 : 0.05, ctx.currentTime, 0.1);
      } else if (!on && sirenOn) {
        sirenOn = false;
        if (sirenTimer) { clearInterval(sirenTimer); sirenTimer = null; }
        sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      }
    } catch (e) { /* never throw */ }
  }

  function shot() { noise(0.14, 0.5, 2600); tone(180, 0.08, 'square', 0.16, 60); }
  function punch() { tone(110, 0.12, 'sine', 0.4, 45); noise(0.06, 0.2, 500); }
  function crash() { noise(0.35, 0.5, 800); tone(90, 0.3, 'sawtooth', 0.2, 40); }
  function pickup() { tone(660, 0.1, 'sine', 0.22); setTimeout(() => tone(880, 0.14, 'sine', 0.22), 90); }
  function cash() {
    tone(880, 0.1, 'sine', 0.22);
    setTimeout(() => tone(1108.7, 0.1, 'sine', 0.22), 90);
    setTimeout(() => tone(1318.5, 0.18, 'sine', 0.22), 180);
  }
  function horn() {
    tone(370, 0.18, 'square', 0.12);
    setTimeout(() => tone(466.16, 0.18, 'square', 0.12), 170);
  }
  function missionDone() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, i) => setTimeout(() => tone(n, 0.22, 'triangle', 0.22), i * 130));
  }
  function busted() {
    const notes = [392, 311.13, 233.08];
    notes.forEach((n, i) => setTimeout(() => tone(n, 0.3, 'sawtooth', 0.16), i * 220));
  }
  function click() { tone(1200, 0.04, 'square', 0.1); }

  return {
    unlock, setMuted, isMuted, setEngine, setSiren,
    shot, punch, crash, pickup, cash, horn, missionDone, busted, click,
  };
}
