import { router } from 'expo-router';
import { useEffect } from 'react';

/** Landing route for the link Stripe pages open when they return to the app. */
export default function BillingReturnScreen() {
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/settings');
  }, []);
  return null;
}
