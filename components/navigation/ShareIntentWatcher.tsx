import { useEffect } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';

/**
 * Android delivers a share while any screen is open (no deep link). Whenever
 * something was shared and we are not already on /share, go there.
 */
export default function ShareIntentWatcher() {
  const { hasShareIntent } = useShareIntentContext();
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (hasShareIntent && pathname !== '/share') router.push('/share');
  }, [hasShareIntent, pathname, router]);
  return null;
}
