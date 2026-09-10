import React from 'react';

/**
 * Wraps React.lazy() with automatic retry and page reload on chunk load failure.
 * This completely prevents blank white screens when a new version of the app is deployed.
 */
export function lazyRetry(componentImport, retriesLeft = 2, interval = 1000) {
  return React.lazy(() =>
    new Promise((resolve, reject) => {
      const checkImport = () => {
        componentImport()
          .then((component) => {
            sessionStorage.removeItem('chunk_reload_retry');
            resolve(component);
          })
          .catch((error) => {
            if (retriesLeft > 0) {
              setTimeout(() => {
                lazyRetry(componentImport, retriesLeft - 1, interval)
                  ._payload._result()
                  .then(resolve, reject);
              }, interval);
              return;
            }

            // If retries are exhausted and error looks like a chunk load failure,
            // check if we can safely reload the page to get the latest assets
            const msg = error?.message || String(error || '');
            const isChunkError =
              msg.includes('Failed to fetch dynamically imported module') ||
              msg.includes('error loading dynamically imported module') ||
              msg.includes('Importing a module script failed') ||
              msg.includes('error loading chunk');

            if (isChunkError) {
              const lastReload = sessionStorage.getItem('chunk_reload_retry');
              const now = Date.now();
              if (!lastReload || now - parseInt(lastReload, 10) > 15000) {
                sessionStorage.setItem('chunk_reload_retry', String(now));
                console.warn('[Vite] Stale dynamic chunk detected after deployment. Auto-reloading latest app version...');
                window.location.reload();
                return;
              }
            }

            reject(error);
          });
      };
      checkImport();
    })
  );
}

export default lazyRetry;
