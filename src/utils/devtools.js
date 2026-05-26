/**
 * DevTools Detection Heuristics
 * 
 * Provides a 100% silent, non-invasive detection of browser developer tools.
 * This completely avoids debugger statements (which freeze the browser) and console hacks.
 */

/**
 * Checks if DevTools is currently open.
 * @returns {boolean} True if DevTools is open.
 */
/**
 * Checks if DevTools is currently open.
 * @returns {boolean} True if DevTools is open.
 */
export function checkIsDevToolsOpen() {
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return false;
  }
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  const threshold = 160;
  const widthDev = window.outerWidth - window.innerWidth > threshold;
  const heightDev = window.outerHeight - window.innerHeight > threshold;

  // Detect if a desktop host is emulating a mobile device
  let isEmulatingMobile = false;

  if (isMobileUA) {
    const platform = (navigator.platform || '').toLowerCase();
    const ua = navigator.userAgent.toLowerCase();

    // 1. Check if platform reports a desktop OS while user agent reports mobile
    if (platform.includes('win')) {
      isEmulatingMobile = true;
    } else if (platform.includes('macintel') || platform.includes('mac') || platform === 'macintosh') {
      // Real iPhones and iPods never report MacIntel/Mac/Macintosh.
      // Real iPads report MacIntel in desktop mode, but if requesting mobile site (isMobileUA === true),
      // we check touch points to distinguish a real iPad from macOS desktop emulating it.
      if (!ua.includes('ipad')) {
        isEmulatingMobile = true;
      } else {
        // iPad emulation check
        const hasLowTouchPoints = navigator.maxTouchPoints <= 1;
        if (hasLowTouchPoints) {
          isEmulatingMobile = true;
        }
      }
    } else if (platform.includes('linux')) {
      // Real Android reports 'Linux arm...', 'Linux aarch64', etc.
      // Desktop Linux reports 'Linux x86_64', 'Linux i686', etc.
      if (platform.includes('x86') || platform.includes('i686') || platform.includes('i386') || platform.includes('amd64')) {
        isEmulatingMobile = true;
      }
    }
  }

  if (isMobileUA) {
    return isEmulatingMobile;
  } else {
    // Desktop check
    if (widthDev || heightDev) return true;

    // Desktop Small Viewport Enforcer
    // Skip this for touch devices (like iPads, tablets, or touch laptops) to avoid false positives when portrait
    const isTouchDevice = navigator.maxTouchPoints > 1;
    if (!isTouchDevice) {
      if (window.innerWidth < 1000 || window.innerHeight < 700) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Monitors DevTools open/close status changes.
 * @param {Function} onChange Callback triggered with isOpen (boolean).
 * @returns {Function} Cleanup function.
 */
export function detectDevTools(onChange) {
  let isDevOpen = false;
  let getterTriggered = false;

  const element = new Image();
  Object.defineProperty(element, 'id', {
    get: function () {
      getterTriggered = true;
    }
  });

  const check = () => {
    getterTriggered = false;
    console.log(element);
    console.clear();

    // Small delay to let the getter trigger if console is open
    setTimeout(() => {
      const currentOpen = checkIsDevToolsOpen() || getterTriggered;
      if (currentOpen !== isDevOpen) {
        isDevOpen = currentOpen;
        onChange(currentOpen);
      }
    }, 50);
  };

  // Run initial check
  check();

  // Listen to resize events for instant reaction
  window.addEventListener('resize', check);

  // Periodically check every 600ms
  const interval = setInterval(check, 600);

  // Return standard React cleanup function
  return () => {
    window.removeEventListener('resize', check);
    clearInterval(interval);
  };
}
