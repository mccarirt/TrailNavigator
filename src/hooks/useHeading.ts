import { useCallback, useEffect, useRef, useState } from 'react';

interface DeviceOrientationPermissionState {
  permissionGranted: boolean;
  needsUserPermission: boolean;
}

// Tilt-compensated heading calculation using alpha, beta, gamma
function computeTiltCompensatedHeading(alpha: number, beta: number, gamma: number): number {
  const alphaRad = (alpha * Math.PI) / 180;
  const betaRad = (beta * Math.PI) / 180;
  const gammaRad = (gamma * Math.PI) / 180;

  const cA = Math.cos(alphaRad);
  const sA = Math.sin(alphaRad);
  const cB = Math.cos(betaRad);
  const sB = Math.sin(betaRad);
  const cG = Math.cos(gammaRad);
  const sG = Math.sin(gammaRad);

  const rA = -cA * sG - sA * sB * cG;
  const rB = -sA * sG + cA * sB * cG;

  // If flat or close to flat (near zero projection), fall back to (360 - alpha) % 360
  if (Math.abs(rA) < 1e-4 && Math.abs(rB) < 1e-4) {
    let flatHeading = (360 - alpha) % 360;
    if (flatHeading < 0) flatHeading += 360;
    return flatHeading;
  }

  let heading = Math.atan2(rA, rB) * (180 / Math.PI);
  if (heading < 0) {
    heading += 360;
  }
  return heading % 360;
}

export function useHeading(gpsHeading: number | null | undefined, gpsSpeed: number | null | undefined) {
  const [deviceHeading, setDeviceHeading] = useState<number | null>(null);
  const [activeSource, setActiveSource] = useState<'gps' | 'sensor' | 'none'>('none');
  const activeSourceRef = useRef<'gps' | 'sensor' | 'none'>('none');
  const [permissionState, setPermissionState] = useState<DeviceOrientationPermissionState>({
    permissionGranted: false,
    needsUserPermission: false,
  });

  const lastHeadingRef = useRef<number>(0);
  // Offset between GPS true heading and magnetic sensor heading (gpsHeading - sensorHeading)
  const declinationOffsetRef = useRef<number | null>(null);

  // Check if permission is needed (iOS 13+)
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      typeof (DeviceOrientationEvent as unknown as { requestPermission?: unknown })?.requestPermission === 'function'
    ) {
      setPermissionState(prev => ({ ...prev, needsUserPermission: true }));
    } else {
      setPermissionState({ permissionGranted: true, needsUserPermission: false });
    }
  }, []);

  const requestOrientationPermission = useCallback(async () => {
    const DeviceOrientationWithPermission = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };

    if (typeof DeviceOrientationWithPermission.requestPermission === 'function') {
      try {
        const response = await DeviceOrientationWithPermission.requestPermission();
        if (response === 'granted') {
          setPermissionState({ permissionGranted: true, needsUserPermission: false });
          return true;
        }
      } catch (e) {
        console.warn('Error requesting orientation permission:', e);
      }
      return false;
    }
    setPermissionState({ permissionGranted: true, needsUserPermission: false });
    return true;
  }, []);

  // Listen to orientation events
  useEffect(() => {
    if (!permissionState.permissionGranted && permissionState.needsUserPermission) {
      return;
    }

    const handleOrientation = (e: DeviceOrientationEvent) => {
      let heading: number | null = null;

      // 1. iOS Safari webkitCompassHeading
      const webkitCompass = (e as unknown as { webkitCompassHeading?: number }).webkitCompassHeading;
      if (typeof webkitCompass === 'number' && !isNaN(webkitCompass)) {
        heading = webkitCompass;
      }
      // 2. Android Chrome / Absolute orientation with tilt compensation
      else if (e.alpha !== null && !isNaN(e.alpha)) {
        const beta = e.beta !== null && !isNaN(e.beta) ? e.beta : 0;
        const gamma = e.gamma !== null && !isNaN(e.gamma) ? e.gamma : 0;
        heading = computeTiltCompensatedHeading(e.alpha, beta, gamma);
      }

      if (heading !== null) {
        // Smooth heading to prevent jitter
        const prev = lastHeadingRef.current;
        let diff = heading - prev;
        while (diff > 180) diff -= 360;
        while (diff < -180) diff += 360;

        // Apply alpha smoothing factor (0.25)
        const smoothed = (prev + diff * 0.25 + 360) % 360;
        lastHeadingRef.current = smoothed;
        setDeviceHeading(Math.round(smoothed * 10) / 10);
      }
    };

    // On Android, listen ONLY to deviceorientationabsolute when available.
    // If not available, fall back to deviceorientation and use e.absolute to filter out relative values.
    const hasAbsoluteSupport = typeof window !== 'undefined' && 'ondeviceorientationabsolute' in window;

    if (hasAbsoluteSupport) {
      window.addEventListener('deviceorientationabsolute', handleOrientation as EventListener, true);
      return () => {
        window.removeEventListener('deviceorientationabsolute', handleOrientation as EventListener, true);
      };
    } else {
      const fallbackHandler = (e: DeviceOrientationEvent) => {
        const hasWebkit = typeof (e as unknown as { webkitCompassHeading?: number }).webkitCompassHeading === 'number';
        if (hasWebkit || e.absolute) {
          handleOrientation(e);
        }
      };

      window.addEventListener('deviceorientation', fallbackHandler as EventListener, true);
      return () => {
        window.removeEventListener('deviceorientation', fallbackHandler as EventListener, true);
      };
    }
  }, [permissionState.permissionGranted, permissionState.needsUserPermission]);

  const hasGpsHeading = gpsHeading !== null && gpsHeading !== undefined && !isNaN(gpsHeading);
  const speed = gpsSpeed ?? 0;

  // While moving, compute the offset between GPS heading and sensor heading
  useEffect(() => {
    if (speed > 1.0 && hasGpsHeading && deviceHeading !== null) {
      let diff = gpsHeading! - deviceHeading;
      while (diff > 180) diff -= 360;
      while (diff < -180) diff += 360;

      if (declinationOffsetRef.current === null) {
        declinationOffsetRef.current = diff;
      } else {
        let offsetDiff = diff - declinationOffsetRef.current;
        while (offsetDiff > 180) offsetDiff -= 360;
        while (offsetDiff < -180) offsetDiff += 360;
        declinationOffsetRef.current += offsetDiff * 0.1;
      }
    }
  }, [speed, hasGpsHeading, gpsHeading, deviceHeading]);

  // Hysteresis for GPS / sensor switch:
  // - GPS above 1.0 m/s
  // - Back to sensor below 0.5 m/s
  useEffect(() => {
    const current = activeSourceRef.current;
    let nextSource: 'gps' | 'sensor' | 'none' = current;

    if (current === 'gps') {
      if (!hasGpsHeading || speed < 0.5) {
        nextSource = deviceHeading !== null ? 'sensor' : hasGpsHeading ? 'gps' : 'none';
      }
    } else {
      if (hasGpsHeading && speed > 1.0) {
        nextSource = 'gps';
      } else if (deviceHeading !== null) {
        nextSource = 'sensor';
      } else if (hasGpsHeading) {
        nextSource = 'gps';
      } else {
        nextSource = 'none';
      }
    }

    if (nextSource !== current) {
      activeSourceRef.current = nextSource;
      setActiveSource(nextSource);
    }
  }, [speed, hasGpsHeading, deviceHeading]);

  // Determine effective heading:
  // Apply the offset computed while moving to the sensor heading when standing still
  let effectiveHeading = 0;
  if (activeSource === 'gps' && hasGpsHeading) {
    effectiveHeading = gpsHeading!;
  } else if (deviceHeading !== null) {
    const offset = declinationOffsetRef.current ?? 0;
    effectiveHeading = (deviceHeading + offset + 360) % 360;
  } else if (hasGpsHeading) {
    effectiveHeading = gpsHeading!;
  }

  return {
    heading: effectiveHeading,
    headingSource: activeSource,
    needsPermission: permissionState.needsUserPermission && !permissionState.permissionGranted,
    requestPermission: requestOrientationPermission,
  };
}
