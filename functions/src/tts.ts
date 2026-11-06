import './options.js';

import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { createHash } from 'node:crypto';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { effectivePlan } from './plan.js';

// Speech codes used by the app (app/src/lib/languages.ts and app/src/i18n/index.ts).
const LANGUAGES = new Set(['en-US', 'ru-RU', 'es-ES', 'de-DE', 'fr-FR', 'pl-PL']);
// Chirp 3 HD (Gold): Google's most natural voices; the same voice name exists in every language.
const HD_VOICE = 'Chirp3-HD-Aoede';
const MAX_LENGTH = 400;

/**
 * Voice classes, matching `voice` in app/src/lib/plans.ts. "standard" (Pro) is a WaveNet voice: correct
 * pronunciation at a fraction of the HD price; "hd" (Gold) is Chirp 3 HD.
 */
type Quality = 'standard' | 'hd';
const QUALITY_PLANS: Record<Quality, Set<string>> = {
  standard: new Set(['pro_monthly', 'pro_lifetime', 'gold_monthly']),
  hd: new Set(['gold_monthly']),
};

let client: TextToSpeechClient | undefined;
function getClient() {
  client ??= new TextToSpeechClient();
  return client;
}

/**
 * The WaveNet voice for a language (female, like Aoede), looked up once per instance because the voice
 * letters differ between languages and Google retires some of them; undefined lets Google choose.
 */
const standardVoices = new Map<string, Promise<string | undefined>>();
function standardVoice(languageCode: string) {
  let voice = standardVoices.get(languageCode);
  if (!voice) {
    voice = getClient()
      .listVoices({ languageCode })
      .then(([response]) => {
        const voices = (response.voices ?? []).filter(
          (v) => v.name?.startsWith(`${languageCode}-Wavenet-`) && v.languageCodes?.includes(languageCode),
        );
        voices.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
        return (voices.find((v) => v.ssmlGender === 'FEMALE') ?? voices[0])?.name ?? undefined;
      })
      .catch((error) => {
        console.warn('Could not list voices', languageCode, error);
        standardVoices.delete(languageCode);
        return undefined;
      });
    standardVoices.set(languageCode, voice);
  }
  return voice;
}

async function synthesizeMp3(text: string, languageCode: string, name: string | undefined) {
  const request = (voiceName?: string) =>
    getClient().synthesizeSpeech({
      input: { text },
      voice: { languageCode, name: voiceName },
      audioConfig: { audioEncoding: 'MP3' },
    });
  // Google's default voice for the language if this one is not offered in it.
  const [response] = await request(name).catch((error) => {
    if (!name) throw error;
    console.warn('Voice not available, using the default one', name, error);
    return request();
  });
  if (!response.audioContent) throw new Error('No audio returned.');
  return Buffer.from(response.audioContent as Uint8Array);
}

/**
 * Cloud speech for Pro ("standard") and Gold ("hd") users, as base64 MP3. Every text is synthesized once per
 * voice and kept in tts/{hash}, because learners hear the same words and sentences over and over. App versions
 * from before Pro voices send no `quality` and mean "hd".
 */
export const synthesize = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const text = typeof request.data?.text === 'string' ? request.data.text.trim() : '';
  const language = request.data?.language;
  const quality: unknown = request.data?.quality ?? 'hd';
  if (
    !text ||
    text.length > MAX_LENGTH ||
    typeof language !== 'string' ||
    !LANGUAGES.has(language) ||
    (quality !== 'standard' && quality !== 'hd')
  ) {
    throw new HttpsError('invalid-argument', 'Invalid text or language.');
  }

  const db = getFirestore();
  // Bought or granted by the admin in freeplans.
  const plan = await effectivePlan(request.auth.uid, request.auth.token.email);
  if (!QUALITY_PLANS[quality].has(plan)) {
    throw new HttpsError(
      'permission-denied',
      quality === 'hd' ? 'Natural voices are part of the Gold plan.' : 'Cloud voices are part of the Pro and Gold plans.',
    );
  }

  // Gold keys stay as before (Aoede name only), so its existing cache is kept.
  const wavenet = quality === 'standard' ? await standardVoice(language) : undefined;
  const voice = quality === 'hd' ? HD_VOICE : (wavenet ?? 'default');
  const voiceName = quality === 'hd' ? `${language}-${HD_VOICE}` : wavenet;
  const key = createHash('sha256').update(`${voice}\n${language}\n${text}`).digest('hex');
  const cached = db.doc(`tts/${key}`);
  const existing = await cached.get();
  if (existing.exists) return { audio: (existing.get('audio') as Buffer).toString('base64') };

  try {
    const audio = await synthesizeMp3(text, language, voiceName);
    await cached.set({ audio, language, text, voice, quality, createdAt: FieldValue.serverTimestamp() });
    return { audio: audio.toString('base64') };
  } catch (error) {
    console.error('Text-to-Speech failed', language, error);
    throw new HttpsError('unavailable', 'Speech synthesis is temporarily unavailable.');
  }
});
