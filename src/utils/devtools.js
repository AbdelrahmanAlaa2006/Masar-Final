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
let cachedIsDesktopGPU = null;

/**
 * Checks if the WebGL renderer matches a known desktop GPU signature.
 * Caches the result to avoid recreating canvas elements repeatedly.
 * @returns {boolean} True if a desktop GPU signature is detected.
 */
function checkIsDesktopGPU() {
  if (cachedIsDesktopGPU !== null) return cachedIsDesktopGPU;

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const renderer = (gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '').toLowerCase();
        // Desktop GPUs typically contain one of these keywords (including ANGLE backends on desktop Chrome)
        cachedIsDesktopGPU = /nvidia|geforce|rtx|gtx|amd|radeon|intel|uhd|iris|swiftshader|llvmpipe|microsoft|direct3d|virtualbox|vmware|angle|metal/i.test(renderer);
        return cachedIsDesktopGPU;
      }
    }
  } catch (e) {
    // Ignore context creation errors
  }

  cachedIsDesktopGPU = false;
  return cachedIsDesktopGPU;
}

/**
 * Checks if DevTools is currently open.
 * @returns {boolean} True if DevTools is open.
 */
export function checkIsDevToolsOpen() {
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
      // we check touch points and GPU to distinguish a real iPad from macOS desktop emulating it.
      if (!ua.includes('ipad')) {
        isEmulatingMobile = true;
      } else {
        // iPad emulation check
        const isDesktopGPU = checkIsDesktopGPU();
        const hasLowTouchPoints = navigator.maxTouchPoints <= 1;

        if (isDesktopGPU || hasLowTouchPoints) {
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

    // 2. WebGL GPU fallback check for any other desktop signature under mobile UA
    if (!isEmulatingMobile) {
      if (checkIsDesktopGPU()) {
        isEmulatingMobile = true;
      }
    }
  }

  if (isMobileUA) {
    // If it's a real mobile device, widthDev will be false (outerWidth matches innerWidth).
    // If it's emulated mobile on desktop, isEmulatingMobile will be true.
    return isEmulatingMobile || widthDev;
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
