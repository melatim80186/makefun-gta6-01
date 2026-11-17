// audio.js — SOLMAR sound: WebAudio synthesis only, no audio files.
// Every sound is built from oscillators and filtered noise at runtime,
// so the game ships no audio assets and never makes a network request.

// 16-step groove tables (0 = rest): low bass line + plucked lead.
const BASS = [55, 0, 55, 0, 65.41, 0, 55, 0, 49, 0, 49, 0, 58.27, 0, 73.42, 0];
const LEAD = [220, 0, 261.63, 329.63, 0, 293.66, 0, 246.94, 220, 0, 261.63, 0, 329.63, 392, 0, 293.66];

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;
  let musicTimer = null;
  let step = 0;

  // Lazily build the AudioContext and the always-on oscillators on first use.
  function ensure() {
    if (ctx) return true;
    try {
      if (typeof AudioContext === 'undefined') return false;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);

      const engineFilter = ctx.createBiquadFilter();
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

      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch (e) {
      ctx = null;
      return false;
    }
  }

  // One short pitched blip. slideTo (optional) glides the pitch by the end.
  function tone(freq, dur, wave, vol, slideTo) {
    if (muted) return;
    try {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = wave || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
      gain.gain.setValueAtTime(vol || 0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch (e) { /* audio must never break the game */ }
  }

  // A burst of filtered white noise (shots, crashes, hi-hats).
  function noise(dur, vol, filterFreq) {
    if (muted) return;
    try {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq || 1000;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol || 0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start(t);
      src.stop(t + dur + 0.02);
    } catch (e) { /* audio must never break the game */ }
  }

  // 16-step groove: bass + plucked lead, soft hat every 4 steps. Rests are 0.
  function startMusic() {
    try {
      if (musicTimer || !ensure()) return;
      step = 0;
      musicTimer = setInterval(() => {
        try {
          const i = step % 16;
          step += 1;
          if (muted) return;
          const bass = BASS[i];
          if (bass) tone(bass, 0.18, 'triangle', 0.22);
          const lead = LEAD[i];
          if (lead) tone(lead, 0.14, 'square', 0.06);
          if (i % 4 === 0) noise(0.04, 0.05, 6000);
        } catch (e) { /* keep the loop alive */ }
      }, 190);
    } catch (e) { /* music is optional */ }
  }

  // Delayed note helper for multi-note stingers; safe when timers are missing.
  function later(fn, ms) {
    try { setTimeout(fn, ms); } catch (e) { /* timers unavailable */ }
  }

  return {
    unlock() {
      try {
        if (!ensure()) return;
        if (ctx.resume) ctx.resume().catch(() => {});
        startMusic();
      } catch (e) { /* audio must never break the game */ }
    },
    setMuted(m) {
      muted = !!m;
      try { if (master) master.gain.value = muted ? 0 : 0.5; } catch (e) {}
    },
    isMuted() { return muted; },
    setEngine(ratio, driving) {
      try {
        if (!ctx || !engineGain || !engineOsc) return;
        const r = Math.max(0, Math.min(1, ratio || 0));
        const t = ctx.currentTime;
        const gain = driving && !muted ? 0.04 + 0.09 * r : 0;
        engineGain.gain.setTargetAtTime(gain, t, 0.08);
        engineOsc.frequency.setTargetAtTime(55 + 150 * r, t, 0.08);
      } catch (e) {}
    },
    setSiren(wanted) {
      try {
        if (!ctx || !sirenGain || !sirenOsc) return;
        const t = ctx.currentTime;
        const on = wanted > 0 && !muted;
        sirenGain.gain.setTargetAtTime(on ? 0.035 : 0, t, 0.1);
        if (on) {
          const hi = Math.floor(Date.now() / 380) % 2 === 0;
          sirenOsc.frequency.setTargetAtTime(hi ? 950 : 700, t, 0.05);
        }
      } catch (e) {}
    },
    shot() { noise(0.12, 0.5, 1800); tone(180, 0.08, 'square', 0.22, 60); },
    punch() { tone(90, 0.12, 'sine', 0.5, 45); },
    crash() { noise(0.35, 0.5, 500); tone(70, 0.3, 'sawtooth', 0.3, 40); },
    pickup() { tone(660, 0.09, 'sine', 0.25); later(() => tone(880, 0.12, 'sine', 0.25), 90); },
    cash() {
      tone(880, 0.1, 'sine', 0.25);
      later(() => tone(1174.66, 0.1, 'sine', 0.25), 80);
      later(() => tone(1318.51, 0.14, 'sine', 0.25), 160);
    },
    horn() { tone(370, 0.25, 'square', 0.16); tone(466, 0.25, 'square', 0.16); },
    missionDone() {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => later(() => tone(f, 0.16, 'triangle', 0.25), i * 120));
    },
    busted() {
      const notes = [392, 311.13, 233.08];
      notes.forEach((f, i) => later(() => tone(f, 0.2, 'triangle', 0.25), i * 150));
    },
    click() { tone(800, 0.05, 'square', 0.15); },
  };
}
