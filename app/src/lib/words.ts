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

/** Leitner box: 0 = new / just failed, MAX_BOX = well known. */
export const MAX_BOX = 5;

export type Word = {
  id: string;
  word: string;
  lang: 'en';
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
    lang: data.lang ?? 'en',
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

export function subscribeWords(uid: string, onChange: (words: Word[]) => void, onError?: (e: Error) => void) {
  const q = query(wordsCollection(uid), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => onChange(snapshot.docs.map(fromSnapshot)),
    (error) => onError?.(error),
  );
}

export async function fetchWords(uid: string, range: RangeKey) {
  const start = rangeStart(range);
  const q = start
    ? query(wordsCollection(uid), where('createdAt', '>=', Timestamp.fromDate(start)), orderBy('createdAt', 'desc'))
    : query(wordsCollection(uid), orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(fromSnapshot);
}

export async function getWord(uid: string, id: string) {
  const snap = await getDoc(doc(db, 'users', uid, 'words', id));
  return snap.exists() ? fromSnapshot(snap) : null;
}

export function addWord(uid: string, input: WordInput) {
  return addDoc(wordsCollection(uid), {
    ...input,
    lang: 'en',
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
  return updateDoc(doc(db, 'users', uid, 'words', word.id), {
    'stats.asked': increment(1),
    'stats.correct': increment(correct ? 1 : 0),
    'stats.box': box,
    'stats.lastAskedAt': serverTimestamp(),
  });
}
