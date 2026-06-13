import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView, trackPageLeave } from '@/utils/tracker';

/**
 * Auto-tracks page enter / leave for the current route.
 *
 * Place this hook in a page component (or in a global layout) to
 * automatically record dwell time.
 *
 * @param pageTitle  Human-readable page title, e.g. '用户管理'
 */
export function usePageTracker(pageTitle?: string) {
  const location = useLocation();

  useEffect(() => {
    const enterTime = Date.now();
    trackPageView(location.pathname, pageTitle);

    return () => {
      const durationMs = Date.now() - enterTime;
      trackPageLeave(location.pathname, durationMs, pageTitle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);
}
