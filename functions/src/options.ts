import { setGlobalOptions } from 'firebase-functions/v2';

// Imported first by every module that defines functions: ES imports run before the importing module's own code,
// so setting this in index.ts alone would miss functions defined in imported files.
setGlobalOptions({ region: 'europe-central2', maxInstances: 5 });
