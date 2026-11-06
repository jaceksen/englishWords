import { httpsCallable } from '@react-native-firebase/functions';
import { createAudioPlayer } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import * as Speech from 'expo-speech';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useCallback, useRef, useState } from 'react';

import type { UiLanguage } from '@/i18n';
import { functions } from '@/lib/firebase';
import type { Language } from '@/lib/languages';

export type SpeechLang = UiLanguage['speech'] | Language['speech'];

// Shape mirrors functions/src/tts.ts.
const synthesize = httpsCallable<{ text: string; language: SpeechLang; quality: CloudVoice }, { audio: string }>(functions, 'synthesize');

type CloudVoice = 'standard' | 'hd';

/**
 * Who speaks, from the plan (see SettingsProvider): the phone's own voice, or a Google Cloud one, WaveNet
 * for Pro ("standard") and Chirp 3 HD for Gold ("hd").
 */
let voice: 'device' | CloudVoice = 'device';
export function setVoice(value: typeof voice) {
  voice = value;
}

/** Ends the clip that is playing now, resolving its `speak()` promise. */
let finishClip: (() => void) | null = null;

/**
 * Speaks `text` and resolves when finished (or stopped). `onStart` fires when the sound begins, after a
 * cloud clip has been fetched, so a caller can show that it is still waiting.
 */
export async function speak(text: string, language: SpeechLang, rate = 0.95, onStart?: () => void) {
  if (voice !== 'device') {
    try {
      await playClip(await cloudClip(text, language, voice), onStart);
      return;
    } catch {
      // Offline or the service failed: the phone's voice is better than silence.
    }
  }
  onStart?.();
  await speakOnDevice(text, language, rate);
}

export function stopSpeaking() {
  finishClip?.();
  return Speech.stop();
}

function speakOnDevice(text: string, language: SpeechLang, rate: number) {
  return new Promise<void>((resolve) => {
    Speech.speak(text, {
      language,
      rate,
      onDone: () => resolve(),
      onStopped: () => resolve(),
      onError: () => resolve(),
    });
  });
}

/** Small non-cryptographic hash (cyrb53), enough to name cache files. */
function hash(text: string) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** The clip for `text`, from the phone's cache or synthesized once by the server. */
async function cloudClip(text: string, language: SpeechLang, quality: CloudVoice) {
  const directory = new Directory(Paths.cache, 'tts');
  // Gold clips keep their original names, so the cache from before Pro voices stays valid.
  const prefix = quality === 'hd' ? '' : `${quality}-`;
  const file = new File(directory, `${prefix}${language}-${hash(text)}-${text.length}.mp3`);
  if (file.exists) return file;
  const { data } = await synthesize({ text, language, quality });
  directory.create({ idempotent: true, intermediates: true });
  await file.write(data.audio, { encoding: 'base64' });
  return file;
}

function playClip(file: File, onStart?: () => void) {
  return new Promise<void>((resolve) => {
    finishClip?.();
    const player = createAudioPlayer({ uri: file.uri });
    // Safety net: a clip that never reports its end must not block the voice quiz.
    const timeout = setTimeout(() => finish(), 30_000);
    const subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) finish();
    });
    function finish() {
      if (finishClip !== finish) return;
      finishClip = null;
      clearTimeout(timeout);
      try {
        subscription.remove();
        // remove() only forgets the player on Android; release() frees its ExoPlayer, MediaSession and
        // AudioTrack. Without it they pile up until the system refuses new audio tracks and the voice quiz
        // goes silent after a few rounds.
        player.remove();
        player.release();
      } catch {
        // Freeing must never keep the quiz waiting.
      }
      resolve();
    }
    finishClip = finish;
    onStart?.();
    player.play();
  });
}

type Pending = { resolve: (text: string) => void; finals: string[]; latest: string };

/**
 * One speech-recognition session at a time per screen. `listen()` resolves with the final transcript
 * ('' when nothing was heard), so callers can simply `await` the user's answer.
 */
export function useSpeechInput(messages: { noPermission: string }) {
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<Pending | null>(null);

  useSpeechRecognitionEvent('start', () => setListening(true));

  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript ?? '';
    const p = pending.current;
    if (!p) return;
    if (event.isFinal) {
      p.finals.push(transcript);
      p.latest = '';
    } else {
      p.latest = transcript;
    }
    setPartial([...p.finals, p.latest].join(' ').trim());
  });

  useSpeechRecognitionEvent('error', (event) => {
    // "no-speech" / "aborted" just mean nothing was captured; 'end' resolves with ''.
    if (event.error !== 'no-speech' && event.error !== 'aborted' && event.error !== 'speech-timeout') {
      setError(event.message || event.error);
    }
  });

  // 'end' is always emitted last, including after errors.
  useSpeechRecognitionEvent('end', () => {
    setListening(false);
    const p = pending.current;
    pending.current = null;
    p?.resolve([...p.finals, p.latest].join(' ').trim());
  });

  const listen = useCallback(async (lang: SpeechLang, { short = true }: { short?: boolean } = {}) => {
    setError(null);
    setPartial('');
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setError(messages.noPermission);
      return '';
    }
    pending.current?.resolve('');
    return new Promise<string>((resolve) => {
      pending.current = { resolve, finals: [], latest: '' };
      ExpoSpeechRecognitionModule.start({
        lang,
        interimResults: true,
        maxAlternatives: 1,
        continuous: false,
        // "web_search" recognizes short, single-word utterances better; "free_form" suits sentences.
        androidIntentOptions: { EXTRA_LANGUAGE_MODEL: short ? 'web_search' : 'free_form' },
      });
    });
  }, [messages.noPermission]);

  const stop = useCallback(() => ExpoSpeechRecognitionModule.stop(), []);
  const abort = useCallback(() => ExpoSpeechRecognitionModule.abort(), []);

  return { listening, partial, error, listen, stop, abort };
}
