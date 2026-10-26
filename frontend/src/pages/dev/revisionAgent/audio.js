// Micro → PCM16 24 kHz, et lecture en file de la voix du prof (PCM16 24 kHz).
export const SAMPLE_RATE = 24000;

export class AudioLink {
  constructor() {
    // Le navigateur rééchantillonne le micro au sampleRate du contexte.
    this.ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    this.stream = null;
    this.nextPlayTime = 0;
    this.sources = new Set();
  }

  async startMicrophone(onChunk) {
    await this.ctx.resume();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    await this.ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}revision-pcm-capture.js`);
    const source = this.ctx.createMediaStreamSource(this.stream);
    const capture = new AudioWorkletNode(this.ctx, "revision-pcm-capture");
    capture.port.onmessage = (e) => onChunk(e.data);
    // Le worklet doit être relié à la sortie pour être cadencé ; gain nul pour ne pas s'entendre.
    const mute = this.ctx.createGain();
    mute.gain.value = 0;
    source.connect(capture).connect(mute).connect(this.ctx.destination);
  }

  play(pcm) {
    const samples = new Int16Array(pcm);
    if (samples.length === 0) return;
    const buffer = this.ctx.createBuffer(1, samples.length, SAMPLE_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 0x8000;

    const node = this.ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(this.ctx.destination);
    const startAt = Math.max(this.nextPlayTime, this.ctx.currentTime + 0.05);
    node.start(startAt);
    this.nextPlayTime = startAt + buffer.duration;
    this.sources.add(node);
    node.onended = () => this.sources.delete(node);
  }

  // Le prof a été interrompu : on jette l'audio programmé mais pas encore joué.
  flush() {
    this.sources.forEach((s) => s.stop());
    this.sources.clear();
    this.nextPlayTime = 0;
  }

  async close() {
    this.sources.forEach((s) => s.stop());
    this.stream?.getTracks().forEach((t) => t.stop());
    await this.ctx.close();
  }
}
