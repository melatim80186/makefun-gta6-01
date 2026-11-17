// audio.js — WebAudio synthesis for SOLMAR: every sound effect and the
// music loop are generated live with oscillators and filtered noise.
// No audio files ship with the game and nothing is fetched over the
// network. All public methods are safe to call before unlock() and
// never throw, so audio can never break the game loop.
// Factory: returns the sound object used by the world and the menus.
// The AudioContext is created lazily inside unlock(), which runs only
// after a user gesture, so browsers never block it as autoplay.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = null;
  let sirenHigh = false;
  let muted = false;
  let musicTimer = null;
  let musicStep = 0;
  // Create the context and the always-on oscillators. Returns true when
  // audio is available, false when the browser has no WebAudio support.
  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      // Engine hum: sawtooth through a lowpass, silent until driving.
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Siren: plain triangle, silent until the player is wanted.
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch (err) {
      ctx = null;
      return false;
    }
  }
  // One short oscillator note. `slide` is an optional target frequency
  // the pitch glides to over the note. No-op when muted or unavailable.
  function tone(freq, dur, wave, vol, slide) {
    if (muted || !ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      osc.type = wave || 'sine';
      osc.frequency.setValueAtTime(freq, now);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slide), now + dur);
      gain.gain.setValueAtTime(vol || 0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + dur + 0.02);
    } catch (err) { /* audio must never throw */ }
  }
  // One burst of filtered white noise. No-op when muted or unavailable.
  function noise(dur, vol, filterFreq) {
    if (muted || !ctx) return;
    try {
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq || 1200;
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(vol || 0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start(now);
      src.stop(now + dur + 0.02);
    } catch (err) { /* audio must never throw */ }
  }
  // 16-step bass line (A minor groove) and plucked lead; 0 is a rest.
  const BASS = [110, 0, 110, 0, 130.81, 0, 110, 0, 98, 0, 98, 0, 146.83, 0, 164.81, 0];
  const LEAD = [440, 0, 523.25, 659.25, 0, 523.25, 440, 0, 392, 0, 440, 523.25, 587.33, 0, 659.25, 0];
  // One music step: bass note, lead pluck, hat every 4 steps.
  function musicTick() {
    if (muted || !ctx) return;
    try {
      const i = musicStep % 16;
      const bass = BASS[i];
      if (bass) tone(bass, 0.22, 'triangle', 0.16);
      const lead = LEAD[i];
      if (lead) tone(lead, 0.16, 'square', 0.06);
      if (i % 4 === 0) noise(0.03, 0.04, 6000);
      musicStep++;
    } catch (err) { /* audio must never throw */ }
  }
  function startMusic() {
    if (musicTimer || !ctx) return;
    try { musicTimer = setInterval(musicTick, 190); } catch (err) { musicTimer = null; }
  }
  // Create/resume the context and start the music loop. Safe to call twice.
  function unlock() {
    try {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      startMusic();
    } catch (err) { /* audio must never throw */ }
  }
  function setMuted(m) {
    muted = !!m;
    try { if (master) master.gain.value = muted ? 0 : 0.5; } catch (err) { /* ignore */ }
  }
  function isMuted() { return muted; }
  // Engine hum follows the speed ratio (0..1). Silent when not driving.
  function setEngine(ratio, driving) {
    if (!ctx || !engineOsc || !engineGain) return;
    try {
      const r = Math.max(0, Math.min(1, ratio || 0));
      const on = driving === undefined ? r > 0.02 : !!driving && r > 0.02;
      const now = ctx.currentTime;
      engineGain.gain.setTargetAtTime(on ? 0.05 + 0.09 * r : 0, now, 0.08);
      engineOsc.frequency.setTargetAtTime(50 + 140 * r, now, 0.08);
    } catch (err) { /* audio must never throw */ }
  }
  // Two-tone police wail while wanted; silent when clean.
  function setSiren(wanted) {
    if (!ctx || !sirenOsc || !sirenGain) return;
    try {
      const on = !!wanted && wanted !== 0;
      const now = ctx.currentTime;
      if (on && !sirenTimer) {
        sirenGain.gain.setTargetAtTime(0.05, now, 0.1);
        sirenHigh = false;
        sirenTimer = setInterval(() => {
          try {
            sirenHigh = !sirenHigh;
            sirenOsc.frequency.setValueAtTime(sirenHigh ? 880 : 660, ctx.currentTime);
          } catch (err) { /* ignore */ }
        }, 450);
      } else if (!on && sirenTimer) {
        clearInterval(sirenTimer);
        sirenTimer = null;
        sirenGain.gain.setTargetAtTime(0, now, 0.1);
      }
    } catch (err) { /* audio must never throw */ }
  }
  // Staggered notes for multi-note stingers; safe before unlock.
  function after(ms, fn) { try { setTimeout(fn, ms); } catch (err) { /* ignore */ } }
  function shot() { noise(0.12, 0.35, 1800); tone(160, 0.08, 'square', 0.15, 60); }
  function punch() { tone(90, 0.12, 'sine', 0.4, 50); noise(0.06, 0.2, 400); }
  function crash() { noise(0.35, 0.4, 900); tone(70, 0.3, 'sawtooth', 0.25, 40); }
  function pickup() { tone(660, 0.09, 'sine', 0.2); after(90, () => tone(880, 0.12, 'sine', 0.2)); }
  function cash() { tone(880, 0.09, 'sine', 0.2); after(70, () => tone(1174.66, 0.09, 'sine', 0.2)); after(140, () => tone(1567.98, 0.14, 'sine', 0.2)); }
  function horn() { tone(370, 0.25, 'square', 0.16); tone(466.16, 0.25, 'square', 0.16); }
  function missionDone() { tone(523.25, 0.12, 'square', 0.16); after(110, () => tone(659.25, 0.12, 'square', 0.16)); after(220, () => tone(783.99, 0.12, 'square', 0.16)); after(330, () => tone(1046.5, 0.22, 'square', 0.18)); }
  function busted() { tone(392, 0.16, 'sawtooth', 0.18); after(140, () => tone(329.63, 0.16, 'sawtooth', 0.18)); after(280, () => tone(261.63, 0.3, 'sawtooth', 0.18)); }
  function click() { tone(900, 0.05, 'square', 0.12); }
  return { unlock, setMuted, isMuted, setEngine, setSiren, shot, punch, crash, pickup, cash, horn, missionDone, busted, click };
}
export default createAudio;
