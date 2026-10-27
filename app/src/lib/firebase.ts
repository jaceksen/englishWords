import { getApp } from '@react-native-firebase/app';
import { getAuth } from '@react-native-firebase/auth';
import { getFirestore } from '@react-native-firebase/firestore';
import { getFunctions } from '@react-native-firebase/functions';

// Must match the region set in functions/src/index.ts.
const FUNCTIONS_REGION = 'europe-central2';

export const auth = getAuth();
export const db = getFirestore();
export const functions = getFunctions(getApp(), FUNCTIONS_REGION);
