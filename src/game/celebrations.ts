// Confetti & friends. Celebrations briefly pause detection (the caller does
// that) so the jingle/cheer noise can't produce spurious verdicts.

import confetti from "canvas-confetti";

export function smallSparkle() {
  confetti({
    particleCount: 30,
    spread: 55,
    startVelocity: 25,
    origin: { y: 0.9 },
    scalar: 0.8,
    disableForReducedMotion: true,
  });
}

export function celebrate(theme: string) {
  switch (theme) {
    case "confetti-fireworks":
      fireworks();
      break;
    case "confetti-emoji":
      emojiRain();
      break;
    case "confetti-stars":
      starBurst();
      break;
    default:
      classic();
  }
}

function classic() {
  confetti({ particleCount: 160, spread: 80, origin: { y: 0.7 } });
  setTimeout(() => confetti({ particleCount: 80, spread: 120, origin: { y: 0.6 } }), 250);
}

function fireworks() {
  const end = Date.now() + 1200;
  const frame = () => {
    confetti({
      particleCount: 40,
      startVelocity: 40,
      spread: 360,
      ticks: 60,
      origin: { x: Math.random(), y: Math.random() * 0.5 + 0.1 },
    });
    if (Date.now() < end) setTimeout(frame, 220);
  };
  frame();
}

function emojiRain() {
  const shapes = ["🎵", "🎶", "⭐", "🎹"].map((e) =>
    confetti.shapeFromText({ text: e, scalar: 3 }),
  );
  confetti({
    particleCount: 50,
    spread: 100,
    scalar: 3,
    shapes,
    origin: { y: 0.4 },
  });
}

function starBurst() {
  confetti({
    particleCount: 120,
    spread: 100,
    shapes: ["star"],
    colors: ["#FFE400", "#FFBD00", "#E89400", "#FFCA6C"],
    origin: { y: 0.6 },
  });
}

/** Success jingle for tier pass: a rising arpeggio on a soft triangle wave. */
export function playJingle(context: AudioContext, big = false) {
  const now = context.currentTime + 0.02;
  const gain = context.createGain();
  gain.gain.value = 0.25;
  gain.connect(context.destination);
  const notes = big ? [523.25, 659.25, 783.99, 1046.5, 1318.5] : [523.25, 659.25, 783.99];
  notes.forEach((f, i) => {
    const osc = context.createOscillator();
    const env = context.createGain();
    osc.type = "triangle";
    osc.frequency.value = f;
    const t = now + i * 0.12;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    osc.connect(env);
    env.connect(gain);
    osc.start(t);
    osc.stop(t + 0.55);
  });
}
