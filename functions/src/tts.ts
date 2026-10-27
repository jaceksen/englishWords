import './options.js';

import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { createHash } from 'node:crypto';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { effectivePlan } from './plan.js';

// Speech codes used by the app (app/src/lib/languages.ts and app/src/i18n/index.ts).
const LANGUAGES = new Set(['en-US', 'ru-RU', 'es-ES', 'de-DE', 'fr-FR', 'pl-PL']);
// Chirp 3 HD: Google's most natural voices; the same voice name exists in every language.
const VOICE = 'Chirp3-HD-Aoede';
const MAX_LENGTH = 400;

let client: TextToSpeechClient | undefined;
function getClient() {
  client ??= new TextToSpeechClient();
  return client;
}

async function synthesizeMp3(text: string, languageCode: string) {
  const request = (name?: string) =>
    getClient().synthesizeSpeech({
      input: { text },
      voice: { languageCode, name },
      audioConfig: { audioEncoding: 'MP3' },
    });
  // Google's default voice for the language if this one is not offered in it.
  const [response] = await request(`${languageCode}-${VOICE}`).catch((error) => {
    console.warn('Voice not available, using the default one', languageCode, error);
    return request();
  });
  if (!response.audioContent) throw new Error('No audio returned.');
  return Buffer.from(response.audioContent as Uint8Array);
}

/**
 * Natural speech for Gold users, as base64 MP3. Every text is synthesized once and kept in tts/{hash},
 * because learners hear the same words and sentences over and over.
 */
export const synthesize = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const text = typeof request.data?.text === 'string' ? request.data.text.trim() : '';
  const language = request.data?.language;
  if (!text || text.length > MAX_LENGTH || typeof language !== 'string' || !LANGUAGES.has(language)) {
    throw new HttpsError('invalid-argument', 'Invalid text or language.');
  }

  const db = getFirestore();
  // Bought or granted by the admin in freeplans.
  const plan = await effectivePlan(request.auth.uid, request.auth.token.email);
  if (plan !== 'gold_monthly') {
    throw new HttpsError('permission-denied', 'Natural voices are part of the Gold plan.');
  }

  const key = createHash('sha256').update(`${VOICE}\n${language}\n${text}`).digest('hex');
  const cached = db.doc(`tts/${key}`);
  const existing = await cached.get();
  if (existing.exists) return { audio: (existing.get('audio') as Buffer).toString('base64') };

  try {
    const audio = await synthesizeMp3(text, language);
    await cached.set({ audio, language, text, voice: VOICE, createdAt: FieldValue.serverTimestamp() });
    return { audio: audio.toString('base64') };
  } catch (error) {
    console.error('Text-to-Speech failed', language, error);
    throw new HttpsError('unavailable', 'Speech synthesis is temporarily unavailable.');
  }
});
