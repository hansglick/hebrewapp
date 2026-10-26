// AudioWorklet de l'agent de révision (cf. src/pages/dev/revisionAgent/audio.js) :
// convertit le micro (Float32, au sampleRate du contexte = 24 kHz) en blocs
// PCM16 mono de 100 ms envoyés au thread principal.
const CHUNK = 2400;

class RevisionPcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Int16Array(CHUNK);
    this.length = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) {
      for (let i = 0; i < channel.length; i++) {
        const s = Math.max(-1, Math.min(1, channel[i]));
        this.buffer[this.length++] = s < 0 ? s * 0x8000 : s * 0x7fff;
        if (this.length === CHUNK) {
          this.port.postMessage(this.buffer.buffer, [this.buffer.buffer]);
          this.buffer = new Int16Array(CHUNK);
          this.length = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor("revision-pcm-capture", RevisionPcmCapture);
