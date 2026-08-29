const C3 = 130.81;

// prettier-ignore
const MUSIC_CHORDS = [
  [
    [11, 2, 9, 13, 6], // Bm9
    [9, 1, 8, 11, 4], // Amaj9
    [7, -1, 6, 9, 2], // Gmaj9
    [6, 11, 4, 8, 1], // F#7sus4
  ],
  [
    [4, 7, 2, 6, 11], // Em9
    [6, 9, 4, 8, 1], // F#m9
    [7, -1, 6, 9, 2], // Gmaj9
    [6, 10, 4, 9, 1], // F#7#9
  ],
  [
    [11, 2, 9, 13, 6], // Bm9
    [9, 1, 7, 11, 6], // A13
    [7, -1, 6, 9, 2], // Gmaj9
    [6, 10, 4, 9, 1], // F#7#9 turnaround
  ],
  [
    [7, -1, 6, 9, 2], // Gmaj9
    [9, 1, 7, 11, 6], // A13
    [2, 6, 1, 4, 9], // Dmaj9
    [6, 10, 4, 9, 1], // F#7#9 turnaround
  ],
];

// prettier-ignore
const BASS_LINES = [
  // Aa: descending minor-key hook over Bm9-Amaj9-Gmaj9-F#7sus4.
  [
    11, -1, -1, 18, -1, -1, -1, 23, -1, -1, 21, -1, -1, -1, 18, -1,
    9, -1, -1, 16, -1, -1, -1, 21, -1, -1, 19, -1, -1, -1, 16, -1,
    7, -1, -1, 14, -1, -1, -1, 19, -1, -1, 18, -1, -1, -1, 14, -1,
    6, -1, -1, 13, -1, -1, -1, 18, -1, -1, 16, -1, -1, -1, 10, -1,
  ],
  // Ba: busier response over Em9-F#m9-Gmaj9-F#7#9.
  [
    4, -1, -1, 11, -1, -1, 16, -1, -1, -1, 14, -1, -1, 11, -1, -1,
    6, -1, -1, 13, -1, -1, 18, -1, -1, -1, 16, -1, -1, 13, -1, -1,
    7, -1, -1, 14, -1, -1, 19, -1, -1, -1, 18, -1, -1, 16, -1, -1,
    6, -1, -1, 13, -1, -1, 16, -1, -1, -1, 10, -1, -1, 11, -1, -1,
  ],
  // Ca: strongest bass hook and turnaround over Bm9-A13-Gmaj9-F#7#9.
  [
    11, -1, -1, 18, -1, -1, 21, -1, -1, 18, -1, -1, 14, -1, 10, -1,
    9, -1, -1, 16, -1, -1, 21, -1, -1, 19, -1, -1, 13, -1, 8, -1,
    7, -1, -1, 14, -1, -1, 19, -1, -1, 18, -1, -1, 14, -1, 10, -1,
    6, -1, -1, 13, -1, -1, 18, -1, -1, 16, -1, -1, 10, -1, 11, -1,
  ],
  // Da: final hook over Gmaj9-A13-Dmaj9-F#7#9.
  [
    7, -1, -1, 14, -1, -1, 19, -1, -1, 16, -1, -1, 14, -1, 11, -1,
    9, -1, -1, 16, -1, -1, 21, -1, -1, 18, -1, -1, 16, -1, 13, -1,
    2, -1, -1, 9, -1, -1, 14, -1, -1, 16, -1, -1, 14, -1, 13, -1,
    6, -1, -1, 13, -1, -1, 18, -1, -1, 16, -1, -1, 10, -1, 11, -1,
  ],
];

export class GameAudio {
  #context?: AudioContext;
  #muted = false;
  #music?: number;

  unlock(): void {
    this.#context ??= new AudioContext();
    if (this.#context.state === "suspended") void this.#context.resume();
  }

  tone(frequency: number, duration: number, bend = 0, volume = 0.075, type: OscillatorType = "triangle"): void {
    if (!this.#context || this.#muted || volume <= 0) {
      return;
    }

    const start = this.#context.currentTime;
    const oscillator = this.#context.createOscillator();
    const gain = this.#context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, frequency + bend), start + duration);
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.008, duration / 2));
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain).connect(this.#context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration);
  }

  launch(): void {
    this.tone(260, 0.16, 480, 0.09);
  }

  kill(): void {
    this.tone(780, 0.12, 400, 0.06);
  }

  death(): void {
    this.tone(180, 0.55, -140, 0.12);
  }

  pause(): void {
    this.tone(420, 0.14, -220, 0.0675);
  }

  resume(): void {
    this.tone(220, 0.14, 300, 0.0675);
  }

  startGame(): void {
    this.tone(260, 0.2, 520, 0.09);
    this.tone(390, 0.16, 420, 0.0525);
  }

  rideAgain(): void {
    this.tone(190, 0.13, 210, 0.0825);
    this.tone(380, 0.18, 360, 0.0525);
  }

  skipTutorial(): void {
    this.tone(520, 0.1, 260, 0.0675);
  }

  music(play = true): void {
    clearTimeout(this.#music);
    if (play) {
      let level = 0;
      let step = 0;
      const playStep = () => {
        const position = step % 16;
        const bassLine = BASS_LINES[level];
        const bassNote = bassLine[step];
        if (bassNote >= 0) {
          const bassFrequency = (C3 / 2) * 2 ** (bassNote / 12);
          const bassDuration = position === 0 ? 0.34 : position >= 13 ? 0.13 : 0.23;
          const bassVolume = position === 0 ? 0.063 : position >= 13 ? 0.051 : 0.057;
          this.tone(bassFrequency, bassDuration, 0, bassVolume, "sine");
        }

        const bar = step >> 4;
        const chord = MUSIC_CHORDS[level][bar];

        // Syncopated keyboard hits; A, B, and C add voices as they build.
        if (position === 0 || (level && position === 10)) {
          const chordVoiceCount = Math.min(level + 2, 4);
          const chordDuration = position ? 0.38 : 0.72;
          const chordVolume = (position ? 0.0135 : 0.018) / chordVoiceCount;
          for (let voice = 1; voice <= chordVoiceCount; voice++) {
            this.tone(C3 * 2 * 2 ** (chord[voice] / 12), chordDuration, 0, chordVolume, "sine");
          }
        }

        // B introduces the core kick/rim groove.
        if (level) {
          if (position === 0 || position === 10) this.tone(90, 0.1, -45, 0.027, "sine");
          if (position === 4 || position === 12) this.tone(260, 0.045, 180, 0.012, "square");

          // C and D add syncopated ghost kicks, low toms, and a quiet rim pickup.
          if (level >= 2) {
            if (position === 3 || position === 8 || position === 15) {
              this.tone(82, 0.08, -35, 0.015, "sine");
            }
            if (position === 6 || position === 14) this.tone(150, 0.07, -40, 0.009);
            if (position === 11) this.tone(240, 0.03, 100, 0.0045, "square");
          }

          // D adds low percussion and a final-bar tom fill.
          if (level === 3) {
            if (position === 2 || position === 9) this.tone(190, 0.05, -60, 0.0075);
            if (bar === 3 && position === 13) this.tone(180, 0.08, -40, 0.009);
            if (bar === 3 && position === 15) this.tone(120, 0.1, -30, 0.012);
          }
        }

        const laidBackBeat = position === 3 || position === 11 ? 6 : position === 4 || position === 12 ? -6 : 0;
        const swingDelay = (step % 2 ? 128 : 150) + laidBackBeat;
        step++;
        if (step === bassLine.length) {
          step = 0;
          level = (level + 1) % BASS_LINES.length;
        }
        this.#music = setTimeout(playStep, swingDelay);
      };
      playStep();
    }
  }

  toggle(): boolean {
    this.#muted = !this.#muted;
    if (!this.#muted) {
      this.unlock();
      this.tone(520, 0.12, 160, 0.06);
    }
    return this.#muted;
  }
}
