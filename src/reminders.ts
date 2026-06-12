type ReminderKind = "focus-complete" | "break-complete";

type ReminderCopy = {
  title: string;
  body: string;
  tag: string;
};

const reminderCopies: Record<ReminderKind, ReminderCopy> = {
  "focus-complete": {
    title: "番茄钟结束了",
    body: "本轮专注已完成，请回到 Status Record 完成复盘。",
    tag: "status-record-focus-complete",
  },
  "break-complete": {
    title: "休息时间结束了",
    body: "可以回到工位，选择下一轮番茄钟继续。",
    tag: "status-record-break-complete",
  },
};

let audioContext: AudioContext | null = null;

export async function primeReminderChannel() {
  await requestNotificationPermission();
  await resumeAudioContext();
}

export function sendReminder(kind: ReminderKind) {
  showBrowserNotification(kind);
  playDefaultReminderSound();
}

async function requestNotificationPermission() {
  if (!("Notification" in window) || Notification.permission !== "default") {
    return;
  }

  try {
    await Notification.requestPermission();
  } catch {
    // Some browsers reject permission prompts outside user activation.
  }
}

function showBrowserNotification(kind: ReminderKind) {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  const copy = reminderCopies[kind];

  try {
    new Notification(copy.title, {
      body: copy.body,
      tag: copy.tag,
      requireInteraction: kind === "focus-complete",
      silent: false,
    });
  } catch {
    // Keep the in-page notice as the reliable fallback.
  }
}

async function resumeAudioContext() {
  const context = getAudioContext();

  if (!context || context.state !== "suspended") {
    return;
  }

  try {
    await context.resume();
  } catch {
    // Audio remains optional; browser notifications and in-page notices still work.
  }
}

function playDefaultReminderSound() {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const play = () => {
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.setValueAtTime(660, now + 0.12);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.44);
  };

  if (context.state === "suspended") {
    void context.resume().then(play).catch(() => undefined);
    return;
  }

  play();
}

function getAudioContext() {
  if (audioContext) {
    return audioContext;
  }

  const AudioContextConstructor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioContextConstructor) {
    return null;
  }

  try {
    audioContext = new AudioContextConstructor();
  } catch {
    audioContext = null;
  }

  return audioContext;
}
