import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from '@react-native-firebase/firestore';

import { dayKey, rangeStart, type RangeKey } from '@/lib/dates';
import { db } from '@/lib/firebase';
import { DEFAULT_LANGUAGE, isLanguageCode, type LanguageCode } from '@/lib/languages';

/** Leitner box: 0 = new / just failed, MAX_BOX = well known. */
export const MAX_BOX = 5;

export type Word = {
  id: string;
  word: string;
  lang: LanguageCode;
  translations: string[];
  context: string;
  partOfSpeech: string;
  definition: string;
  createdAt: Date;
  dayKey: string;
  stats: { asked: number; correct: number; box: number; lastAskedAt: Date | null };
};

export type WordInput = Pick<Word, 'word' | 'translations' | 'context' | 'partOfSpeech' | 'definition'>;

function wordsCollection(uid: string) {
  return collection(db, 'users', uid, 'words');
}

function fromSnapshot(snap: { id: string; data: () => any }): Word {
  const data = snap.data();
  return {
    id: snap.id,
    word: data.word,
    // Words saved before multi-language support have no lang and are English.
    lang: isLanguageCode(data.lang) ? data.lang : DEFAULT_LANGUAGE,
    translations: data.translations ?? [],
    context: data.context ?? '',
    partOfSpeech: data.partOfSpeech ?? '',
    definition: data.definition ?? '',
    // createdAt is null in the local snapshot until the server timestamp is resolved.
    createdAt: data.createdAt?.toDate?.() ?? new Date(),
    dayKey: data.dayKey,
    stats: {
      asked: data.stats?.asked ?? 0,
      correct: data.stats?.correct ?? 0,
      box: data.stats?.box ?? 0,
      lastAskedAt: data.stats?.lastAskedAt?.toDate?.() ?? null,
    },
  };
}

export function subscribeWords(
  uid: string,
  lang: LanguageCode,
  onChange: (words: Word[]) => void,
  onError?: (e: Error) => void,
) {
  const q = query(wordsCollection(uid), where('lang', '==', lang), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => onChange(snapshot.docs.map(fromSnapshot)),
    (error) => onError?.(error),
  );
}

export async function fetchWords(uid: string, lang: LanguageCode, range: RangeKey) {
  const start = rangeStart(range);
  const byLang = where('lang', '==', lang);
  const q = start
    ? query(wordsCollection(uid), byLang, where('createdAt', '>=', Timestamp.fromDate(start)), orderBy('createdAt', 'desc'))
    : query(wordsCollection(uid), byLang, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(fromSnapshot);
}

export async function getWord(uid: string, id: string) {
  const snap = await getDoc(doc(db, 'users', uid, 'words', id));
  return snap.exists() ? fromSnapshot(snap) : null;
}

export function addWord(uid: string, lang: LanguageCode, input: WordInput) {
  return addDoc(wordsCollection(uid), {
    ...input,
    lang,
    createdAt: serverTimestamp(),
    dayKey: dayKey(),
    stats: { asked: 0, correct: 0, box: 0, lastAskedAt: null },
  });
}

export function updateWord(uid: string, id: string, input: Partial<WordInput>) {
  return updateDoc(doc(db, 'users', uid, 'words', id), input);
}

export function deleteWord(uid: string, id: string) {
  return deleteDoc(doc(db, 'users', uid, 'words', id));
}

export function recordAnswer(uid: string, word: Word, correct: boolean) {
  const box = correct ? Math.min(word.stats.box + 1, MAX_BOX) : 0;
  // Keep the in-memory copy current: the same word can come back in a later quiz round.
  word.stats = {
    asked: word.stats.asked + 1,
    correct: word.stats.correct + (correct ? 1 : 0),
    box,
    lastAskedAt: new Date(),
  };
  return updateDoc(doc(db, 'users', uid, 'words', word.id), {
    'stats.asked': increment(1),
    'stats.correct': increment(correct ? 1 : 0),
    'stats.box': box,
    'stats.lastAskedAt': serverTimestamp(),
  });
}
