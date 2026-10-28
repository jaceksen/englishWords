import { httpsCallable } from '@react-native-firebase/functions';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as XLSX from 'xlsx';

import type { Translations, UiLanguageCode } from '@/i18n';
import { aiErrorMessage } from '@/lib/ai';
import { functions } from '@/lib/firebase';
import { LANGUAGES, type LanguageCode } from '@/lib/languages';
import type { Level } from '@/lib/levels';
import type { WordInput } from '@/lib/words';

/** Most words taken from one file. */
export const MAX_IMPORT = 200;
// Must match MAX_ENRICH_ITEMS in functions/src/import.ts.
const ENRICH_BATCH = 20;
/** Long side of a photo sent to the AI; enough for printed text and keeps the upload small. */
const PHOTO_SIZE = 1600;

// Shapes mirror functions/src/import.ts.
type EnrichedWord = Pick<WordInput, 'word' | 'context' | 'translations' | 'partOfSpeech' | 'definition'>;
type ExtractedWord = EnrichedWord & { cefr: string; confidence: number; recommended: boolean };

type EnrichRequest = {
  lang: LanguageCode;
  nativeLang: UiLanguageCode;
  items: { word: string; context: string; translations: string[] }[];
};

type ExtractRequest = {
  lang: LanguageCode;
  nativeLang: UiLanguageCode;
  /** marked: words underlined or highlighted on the photo; auto: words chosen for the learner's level. */
  mode: 'marked' | 'auto';
  level: Level;
  /** Base64 JPEG. */
  image?: string;
  text?: string;
  /** Words the learner already has, so auto mode does not suggest them. */
  known?: string[];
};

// Must match timeoutSeconds in functions/src/import.ts; Gold reads photos with a slower, stronger model.
const CALL_OPTIONS = { timeout: 300_000 };
const enrichWordsFn = httpsCallable<EnrichRequest, { items: EnrichedWord[] }>(functions, 'enrichWords', CALL_OPTIONS);
const extractWordsFn = httpsCallable<ExtractRequest, { items: ExtractedWord[]; wrongLanguage?: string }>(
  functions,
  'extractWords',
  CALL_OPTIONS,
);

/** A word in the review list before saving. */
export type ImportItem = EnrichedWord & {
  key: string;
  cefr?: string;
  /** Ticked when the list opens. */
  recommended: boolean;
  /** Already in the learner's words. */
  known: boolean;
};

/** Lower case without a leading article, for comparing words. */
export function wordKey(word: string, lang: LanguageCode) {
  const lower = word.normalize('NFKC').toLowerCase().replace(/ё/g, 'е').trim();
  const article = LANGUAGES[lang].article;
  return (article ? lower.replace(article, '') : lower).trim();
}

function toItems(words: (EnrichedWord & { cefr?: string; recommended?: boolean })[], lang: LanguageCode, known: Set<string>) {
  return words.map((word, i): ImportItem => {
    const key = wordKey(word.word, lang);
    const isKnown = known.has(key);
    return { ...word, key: `${key}#${i}`, recommended: !isKnown && (word.recommended ?? true), known: isKnown };
  });
}

// --- Spreadsheet -----------------------------------------------------------------

type SheetRow = { word: string; context: string; translations: string[] };

const HEADER = /^(word|words|słowo|słówko|słówka|wort|wörter|mot|mots|palabra|palabras|слово|слова|vocabulary|term)$/i;

function splitTranslations(text: string) {
  return text
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Android's Downloads folder, where files from e-mail and the browser usually land. */
const DOWNLOADS_URI = 'content://com.android.externalstorage.documents/document/primary%3ADownload';
const SPREADSHEET = /\.(xlsx|xls|csv|txt)$/i;

export class UnsupportedFileError extends Error {}

/**
 * Lets the user browse the phone's folders, starting in Downloads, and pick an .xlsx, .xls or .csv file;
 * null when cancelled. Every file is shown, because phones often give spreadsheets a generic type that a
 * type filter would hide, so the type is checked by the file name instead.
 */
export async function pickSpreadsheet() {
  const picked = await File.pickFileAsync({ initialUri: DOWNLOADS_URI, mimeTypes: '*/*' });
  if (picked.canceled) return null;
  if (!SPREADSHEET.test(picked.result.name)) throw new UnsupportedFileError();
  return picked.result;
}

/**
 * Rows of the first sheet: column A the word, B an example sentence, C translations (both optional).
 * A header row and empty rows are skipped, and repeated words are kept once.
 */
export async function readSpreadsheet(file: File, lang: LanguageCode) {
  // CSV is read as text so that UTF-8 letters (ą, ü, я…) survive.
  const workbook = /\.(csv|txt)$/i.test(file.name)
    ? XLSX.read(await file.text(), { type: 'string' })
    : XLSX.read(await file.base64(), { type: 'base64' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  const table = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' });

  const seen = new Set<string>();
  const rows: SheetRow[] = [];
  table.forEach((cells, index) => {
    const [word, context, translations] = cells.map((cell) => String(cell ?? '').trim());
    if (!word || (index === 0 && HEADER.test(word))) return;
    const key = wordKey(word, lang);
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ word: word.slice(0, 100), context: (context ?? '').slice(0, 500), translations: splitTranslations(translations ?? '') });
  });
  return rows;
}

/** Fills in the rows with AI, in batches; words the learner already has are skipped. */
export async function enrichRows(
  rows: SheetRow[],
  lang: LanguageCode,
  nativeLang: UiLanguageCode,
  known: Set<string>,
  onProgress: (done: number, total: number) => void,
) {
  const fresh = rows.filter((row) => !known.has(wordKey(row.word, lang))).slice(0, MAX_IMPORT);
  const words: EnrichedWord[] = [];
  onProgress(0, fresh.length);
  for (let start = 0; start < fresh.length; start += ENRICH_BATCH) {
    const { data } = await enrichWordsFn({ lang, nativeLang, items: fresh.slice(start, start + ENRICH_BATCH) });
    words.push(...data.items);
    onProgress(words.length, fresh.length);
  }
  return { items: toItems(words, lang, known), skipped: rows.length - fresh.length };
}

// --- Photo and text ------------------------------------------------------------

export class NoPermissionError extends Error {}

/** The photo or text is in another language than the one being learned. */
export class WrongLanguageError extends Error {
  constructor(readonly language: string) {
    super(`Text language: ${language}`);
  }
}

/** A photo from the camera or the gallery, cropped by the user and scaled down; null when cancelled. */
export async function takePhoto(source: 'camera' | 'library') {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new NoPermissionError();
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, quality: 1 };
  const result =
    source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return null;

  const image = await ImageManipulator.manipulate(result.assets[0].uri, {
    maxWidth: PHOTO_SIZE,
    maxHeight: PHOTO_SIZE,
  }).renderAsync();
  const saved = await image.saveAsync({ base64: true, compress: 0.75, format: SaveFormat.JPEG });
  return saved.base64 ?? null;
}

export async function extractWords(request: ExtractRequest, known: Set<string>) {
  const { data } = await extractWordsFn(request);
  if (data.wrongLanguage) throw new WrongLanguageError(data.wrongLanguage);
  return toItems(data.items, request.lang, known);
}

// --- Between the import screens --------------------------------------------------

export type PendingImport = {
  items: ImportItem[];
  /** Words left out because the learner already has them. */
  skipped: number;
  lang: LanguageCode;
  nativeLang: UiLanguageCode;
};

let pending: PendingImport | null = null;

/** Found words handed from the import screen to the review screen. */
export function setPendingImport(value: PendingImport | null) {
  pending = value;
}

export function getPendingImport() {
  return pending;
}

export function toWordInput(item: ImportItem, nativeLang: UiLanguageCode): WordInput {
  return {
    word: item.word.trim(),
    nativeLang,
    context: item.context.trim(),
    translations: item.translations,
    partOfSpeech: item.partOfSpeech,
    definition: item.definition,
  };
}

function languageName(code: string, t: Translations) {
  return (t.languageNames as Record<string, string>)[code] ?? code.toUpperCase();
}

/** Message in the app language for a failed import; `lang` is the language being learned. */
export function importErrorMessage(error: unknown, t: Translations, lang: LanguageCode) {
  if (error instanceof NoPermissionError) return t.import.noCameraPermission;
  if (error instanceof UnsupportedFileError) return t.import.unsupportedFile;
  if (error instanceof WrongLanguageError) {
    return t.import.wrongLanguage(languageName(error.language, t), languageName(lang, t));
  }
  const { code, details } = (error ?? {}) as { code?: string; details?: { reason?: string } };
  const name = String(code ?? '').replace(/^functions\//, '');
  if (name === 'resource-exhausted' && details?.reason === 'daily-limit') return t.import.dailyLimit;
  if (name === 'permission-denied') return t.import.locked;
  // Errors without a code come from reading the file or the photo on the phone.
  return name ? aiErrorMessage(error, t) : t.import.readError;
}
