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

// Avant le début d'un enregistrement, ce que le micro, déjà ouvert, a entendu
// et qui lui est ajouté : 5 blocs de 100 ms (cf. revision-pcm-capture.js),
// pour ne pas couper l'élève qui parle un peu trop tôt.
const PREROLL_CHUNKS = 5;

// Volume d'un bloc PCM16, de 0 à 1 (racine de la moyenne des carrés).
function level(pcm) {
  const samples = new Int16Array(pcm);
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return samples.length ? Math.sqrt(sum / samples.length) / 0x8000 : 0;
}

// Mode texte : la réponse enregistrée de l'élève, en WAV (PCM16 mono 24 kHz),
// envoyée au serveur pour transcription et rejouable telle quelle. Le micro
// s'ouvre au premier enregistrement et reste ouvert jusqu'à close (la fin de
// la séance) : sur mobile, l'ouvrir prend jusqu'à une seconde, les
// enregistrements suivants démarrent donc tout de suite (cf. demande
// explicite du user). onLevel : le volume de chaque bloc capté pendant
// l'enregistrement ; le premier dit que le micro capte vraiment.
export class Recorder {
  constructor() {
    this.link = null;
    this.opening = null;
    this.recent = []; // les derniers blocs, hors enregistrement
    this.chunks = null; // les blocs de l'enregistrement en cours
    this.onLevel = null;
  }

  async open() {
    if (!this.opening) {
      this.link = new AudioLink();
      this.opening = this.link.startMicrophone((pcm) => this.capture(pcm)).catch((error) => {
        this.link.close().catch(() => {});
        this.link = this.opening = null;
        throw error;
      });
    }
    await this.opening;
  }

  capture(pcm) {
    if (!this.chunks) {
      this.recent = [...this.recent, pcm].slice(-PREROLL_CHUNKS);
      return;
    }
    this.chunks.push(pcm);
    this.onLevel?.(level(pcm));
  }

  async start(onLevel) {
    await this.open();
    this.chunks = this.recent;
    this.recent = [];
    this.onLevel = onLevel;
  }

  // Fin de l'enregistrement, le micro reste ouvert.
  stop() {
    const chunks = this.chunks ?? [];
    this.chunks = this.onLevel = null;
    const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const header = new DataView(new ArrayBuffer(44));
    const text = (offset, value) => [...value].forEach((c, i) => header.setUint8(offset + i, c.charCodeAt(0)));
    text(0, "RIFF");
    header.setUint32(4, 36 + size, true);
    text(8, "WAVE");
    text(12, "fmt ");
    header.setUint32(16, 16, true);
    header.setUint16(20, 1, true); // PCM
    header.setUint16(22, 1, true); // mono
    header.setUint32(24, SAMPLE_RATE, true);
    header.setUint32(28, SAMPLE_RATE * 2, true);
    header.setUint16(32, 2, true);
    header.setUint16(34, 16, true);
    text(36, "data");
    header.setUint32(40, size, true);
    return new Blob([header, ...chunks], { type: "audio/wav" });
  }

  // Le micro se ferme : le témoin du téléphone s'éteint.
  async close() {
    const link = this.link;
    this.chunks = this.onLevel = this.link = this.opening = null;
    this.recent = [];
    await link?.close();
  }
}
