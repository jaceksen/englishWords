import * as Speech from 'expo-speech';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useCallback, useRef, useState } from 'react';

import type { Language, NATIVE_SPEECH } from '@/lib/languages';

export type SpeechLang = typeof NATIVE_SPEECH | Language['speech'];

/** Speaks `text` and resolves when finished (or stopped). */
export function speak(text: string, language: SpeechLang, rate = 0.95) {
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

export function stopSpeaking() {
  return Speech.stop();
}

type Pending = { resolve: (text: string) => void; finals: string[]; latest: string };

/**
 * One speech-recognition session at a time per screen. `listen()` resolves with the final transcript
 * ('' when nothing was heard), so callers can simply `await` the user's answer.
 */
export function useSpeechInput() {
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
      setError('Brak zgody na użycie mikrofonu.');
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
  }, []);

  const stop = useCallback(() => ExpoSpeechRecognitionModule.stop(), []);
  const abort = useCallback(() => ExpoSpeechRecognitionModule.abort(), []);

  return { listening, partial, error, listen, stop, abort };
}
