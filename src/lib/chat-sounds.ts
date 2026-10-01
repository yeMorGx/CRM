export type ChatSound = "tone" | "chime" | "perk";

export function chatSoundForMessage(senderId: string, userId: string | null, isOpen: boolean): ChatSound | null {
  if (!userId) return null;
  if (senderId === userId) return isOpen ? "tone" : null;
  return isOpen ? "chime" : "perk";
}

const VOLUME = 0.5;
const SOUND_FILES: Record<ChatSound, string> = {
  tone: "/sounds/tone.wav",
  chime: "/sounds/chime.wav",
  perk: "/sounds/perk.wav",
};

let context: AudioContext | null = null;
let preloadPromise: Promise<void> | null = null;
const buffers = new Map<ChatSound, AudioBuffer>();

function getContext() {
  if (typeof window === "undefined" || !window.AudioContext) return null;
  context ??= new AudioContext();
  return context;
}

export function preloadChatSounds() {
  const audioContext = getContext();
  if (!audioContext) return Promise.resolve();
  preloadPromise ??= Promise.all((Object.entries(SOUND_FILES) as [ChatSound, string][]).map(async ([sound, path]) => {
    try {
      const response = await fetch(path);
      if (!response.ok) return;
      buffers.set(sound, await audioContext.decodeAudioData(await response.arrayBuffer()));
    } catch {
      // A missing or unsupported sound must not interrupt chat messaging.
    }
  })).then(() => {
    if (buffers.size < 3) preloadPromise = null;
  });
  return preloadPromise;
}

export async function resumeChatSounds() {
  try {
    const audioContext = getContext();
    if (audioContext?.state === "suspended") await audioContext.resume();
  } catch {
    // Browsers may still reject audio until a user gesture is accepted.
  }
}

export async function playSound(sound: ChatSound) {
  try {
    const audioContext = getContext();
    if (!audioContext) return;
    await preloadChatSounds();
    if (audioContext.state === "suspended") await audioContext.resume();
    const buffer = buffers.get(sound);
    if (!buffer || audioContext.state !== "running") return;
    const source = audioContext.createBufferSource();
    const gain = audioContext.createGain();
    gain.gain.value = VOLUME;
    source.buffer = buffer;
    source.connect(gain).connect(audioContext.destination);
    source.start();
    source.onended = () => { source.disconnect(); gain.disconnect(); };
  } catch {
    // Playback is best effort when the browser blocks background audio.
  }
}
