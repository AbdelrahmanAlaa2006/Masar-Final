/**
 * DevTools Detection Heuristics
 * 
 * Provides a 100% silent, non-invasive detection of browser developer tools.
 * This completely avoids debugger statements (which freeze the browser) and console hacks.
 * It triggers the blocker INSTANTLY upon detecting size discrepancies.
 * 
 * @param {Function} onDetect Callback to trigger when DevTools is detected.
 * @returns {Function} Cleanup function to stop all checks.
 */
export function detectDevTools(onDetect) {
  let isDetected = false;

  const trigger = () => {
    if (!isDetected) {
      isDetected = true;
      onDetect();
    }
  };

  // --- Size Discrepancy (Docked DevTools) ---
  // Tracks difference between outer (browser window) and inner (viewport) sizes.
  // We bypass this on mobile devices to prevent false positives from virtual keyboards.
  const sizeCheck = () => {
    // Detect mobile user agent
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) return;

    const threshold = 160;
    const widthDev = window.outerWidth - window.innerWidth > threshold;
    const heightDev = window.outerHeight - window.innerHeight > threshold;

    if (widthDev || heightDev) {
      trigger();
    }
  };

  // Run size check periodically and on resize
  sizeCheck();
  window.addEventListener('resize', sizeCheck);
  const sizeInterval = setInterval(sizeCheck, 500); // Check every 500ms for instant reaction

  // Return standard React cleanup function
  return () => {
    window.removeEventListener('resize', sizeCheck);
    clearInterval(sizeInterval);
  };
}
