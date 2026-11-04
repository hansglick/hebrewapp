// Micro → PCM16 24 kHz, et lecture en file de la voix du prof (PCM16 24 kHz).
export const SAMPLE_RATE = 24000;

// iPhone : l'audio Web (la voix du prof) est coupé quand le téléphone est en silencieux, sauf si la page se déclare
// en lecture, comme une vidéo (navigator.audioSession, iOS 16.4 et plus ; rien ailleurs). Le micro demande
// « play-and-record » tant qu'il est ouvert (cf. Recorder), puis la page revient en lecture.
export function setAudioSession(type) {
  try {
    if (navigator.audioSession) navigator.audioSession.type = type;
  } catch {
    // navigateur qui refuse ce type : il garde le sien
  }
}

export class AudioLink {
  constructor() {
    // Le navigateur rééchantillonne le micro au sampleRate du contexte.
    this.ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    this.stream = null;
    this.nextPlayTime = 0;
    this.sources = new Set();
  }

  // À appeler pendant le clic qui lance la séance : la page passe en lecture (cf. setAudioSession), le contexte audio
  // se débloque, et un son vide est joué tout de suite, ce que certaines versions d'iOS exigent pendant le geste.
  unlock() {
    setAudioSession("playback");
    this.ctx.resume();
    const silence = this.ctx.createBufferSource();
    silence.buffer = this.ctx.createBuffer(1, 1, SAMPLE_RATE);
    silence.connect(this.ctx.destination);
    silence.start(0);
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

// Volume d'un bloc PCM16, de 0 à 1 (racine de la moyenne des carrés).
function level(pcm) {
  const samples = new Int16Array(pcm);
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return samples.length ? Math.sqrt(sum / samples.length) / 0x8000 : 0;
}

// Mode texte : la réponse enregistrée de l'élève, en WAV (PCM16 mono 24 kHz),
// envoyée au serveur pour transcription et rejouable telle quelle. Le micro
// s'ouvre au premier enregistrement et reste ouvert jusqu'à la fin de la séance
// (close) : la permission n'est demandée qu'une fois, et les réponses suivantes
// démarrent sans attendre (cf. demande explicite du user). Entre deux
// enregistrements, ses blocs sont ignorés. onLevel : le volume de chaque bloc
// capté, le premier dit que le micro capte vraiment ; onChunk : chaque bloc
// (transcription en direct).
export class Recorder {
  constructor() {
    this.link = null;
    this.chunks = null; // les blocs de l'enregistrement en cours
    this.onLevel = null;
    this.onChunk = null;
  }

  async start(onLevel, onChunk = null) {
    if (!this.link) {
      // iPhone : la page déclarée en lecture (cf. AudioLink.unlock) ne pourrait pas enregistrer.
      setAudioSession("play-and-record");
      this.link = new AudioLink();
      try {
        await this.link.startMicrophone((pcm) => this.capture(pcm));
      } catch (error) {
        this.close();
        throw error;
      }
    }
    this.chunks = [];
    this.onLevel = onLevel;
    this.onChunk = onChunk;
  }

  capture(pcm) {
    if (!this.chunks) return;
    this.chunks.push(pcm);
    this.onLevel?.(level(pcm));
    this.onChunk?.(pcm);
  }

  // Fin de l'enregistrement : le micro reste ouvert, ses blocs ignorés jusqu'au suivant.
  stop() {
    const chunks = this.chunks ?? [];
    this.chunks = this.onLevel = this.onChunk = null;
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

  // Fin de la séance : le micro se ferme, le témoin du téléphone s'éteint, et la page revient en lecture (cf.
  // setAudioSession).
  close() {
    const link = this.link;
    this.chunks = this.onLevel = this.onChunk = this.link = null;
    Promise.resolve(link?.close())
      .catch(() => {})
      .finally(() => setAudioSession("playback"));
  }
}
