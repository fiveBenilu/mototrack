import { useCallback, useEffect, useRef, useState } from 'react';
import { haversineDistance, msToKmh } from '../lib/geo';

export type RecorderStatus = 'idle' | 'recording' | 'paused' | 'finished';
export type PermissionState = 'unknown' | 'granted' | 'denied' | 'unsupported';

export interface TrackPoint {
  ts: number;
  lat: number;
  lng: number;
  speed: number; // km/h
  lean: number; // degrees, signed (negative = links, positiv = rechts)
}

export interface RideSummary {
  startedAt: number;
  endedAt: number;
  durationS: number;
  distanceM: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  maxLeanLeft: number;
  maxLeanRight: number;
  track: TrackPoint[];
}

const MIN_SPEED_FOR_LEAN_KMH = 8; // unterhalb dieser Geschwindigkeit zählt Schräglage nicht (Stillstand/Rangieren)
const TRACK_SAMPLE_INTERVAL_MS = 1000;

export interface RecorderOptions {
  onPosition?: (pos: { lat: number; lng: number; speedKmh: number }) => void;
}

export function useRideRecorder(options: RecorderOptions = {}) {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [motionPermission, setMotionPermission] = useState<PermissionState>('unknown');
  const [geoPermission, setGeoPermission] = useState<PermissionState>('unknown');
  const [calibrationOffset, setCalibrationOffset] = useState<number | null>(null);

  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [currentLean, setCurrentLean] = useState(0);
  const [rawGamma, setRawGamma] = useState<number | null>(null);
  const [distanceM, setDistanceM] = useState(0);
  const [durationS, setDurationS] = useState(0);
  const [maxSpeedKmh, setMaxSpeedKmh] = useState(0);
  const [maxLeanLeft, setMaxLeanLeft] = useState(0);
  const [maxLeanRight, setMaxLeanRight] = useState(0);

  const watchIdRef = useRef<number | null>(null);
  const lastPositionRef = useRef<GeolocationCoordinates | null>(null);
  const trackRef = useRef<TrackPoint[]>([]);
  const lastSampleRef = useRef(0);
  const accumulatedMsRef = useRef(0);
  const segmentStartRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const speedSumRef = useRef(0);
  const speedSamplesRef = useRef(0);
  const calibrationRef = useRef<number | null>(null);
  const currentSpeedRef = useRef(0);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onPositionRef = useRef<RecorderOptions['onPosition']>(undefined);

  useEffect(() => {
    calibrationRef.current = calibrationOffset;
  }, [calibrationOffset]);

  useEffect(() => {
    onPositionRef.current = options.onPosition;
  }, [options.onPosition]);

  // --- Permissions -------------------------------------------------------

  const requestPermissions = useCallback(async () => {
    // Geolocation-Anfrage SOFORT (synchron, noch innerhalb des Tap-Events) starten:
    // iOS Safari verknüpft den "User-Gesture"-Kontext nur mit der ersten Aktion nach
    // dem Tap. Ein vorheriges `await` (z.B. für DeviceOrientation) würde diesen
    // Kontext verbrauchen, sodass der Geolocation-Dialog danach nicht mehr erscheint.
    let geoPromise: Promise<PermissionState> | null = null;
    if (navigator.geolocation) {
      geoPromise = new Promise<PermissionState>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          () => resolve('granted'),
          () => resolve('denied'),
          { enableHighAccuracy: true, timeout: 8000 },
        );
      });
    }

    // DeviceOrientation/Motion (iOS 13+ erfordert expliziten Aufruf in einem Button-Tap)
    const DOE = (window as any).DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      try {
        const result: string = await DOE.requestPermission();
        setMotionPermission(result === 'granted' ? 'granted' : 'denied');
      } catch {
        setMotionPermission('denied');
      }
    } else if (DOE) {
      setMotionPermission('granted');
    } else {
      setMotionPermission('unsupported');
    }

    if (!geoPromise) {
      setGeoPermission('unsupported');
      return;
    }
    setGeoPermission(await geoPromise);
  }, []);

  // --- Calibration ---------------------------------------------------------

  const calibrate = useCallback(() => {
    if (rawGamma !== null) {
      setCalibrationOffset(rawGamma);
      return true;
    }
    return false;
  }, [rawGamma]);

  // --- Orientation handling -------------------------------------------------

  useEffect(() => {
    function onOrientation(event: DeviceOrientationEvent) {
      if (event.gamma === null) return;
      setRawGamma(event.gamma);
      const offset = calibrationRef.current ?? 0;
      const lean = event.gamma - offset;
      setCurrentLean(lean);

      // Max-Schräglage nur werten, wenn Fahrzeug eine relevante Geschwindigkeit hat
      // (verhindert, dass Kippeln im Stand als Schräglage gezählt wird)
      if (currentSpeedRef.current >= MIN_SPEED_FOR_LEAN_KMH) {
        if (lean < 0) setMaxLeanLeft((prev) => Math.max(prev, -lean));
        else setMaxLeanRight((prev) => Math.max(prev, lean));
      }
    }

    window.addEventListener('deviceorientation', onOrientation);
    return () => window.removeEventListener('deviceorientation', onOrientation);
  }, []);

  // --- Recording control -----------------------------------------------------

  const startWatchers = useCallback(() => {
    if (watchIdRef.current === null && navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, speed } = pos.coords;
          const now = Date.now();
          const speedKmh = speed !== null && speed >= 0 ? msToKmh(speed) : 0;

          if (lastPositionRef.current) {
            const dist = haversineDistance(
              lastPositionRef.current.latitude,
              lastPositionRef.current.longitude,
              latitude,
              longitude,
            );
            // GPS-Rauschen bei Stillstand filtern
            if (dist > 1) setDistanceM((prev) => prev + dist);
          }
          lastPositionRef.current = pos.coords;

          setCurrentSpeed(speedKmh);
          currentSpeedRef.current = speedKmh;
          setMaxSpeedKmh((prev) => Math.max(prev, speedKmh));
          speedSumRef.current += speedKmh;
          speedSamplesRef.current += 1;

          if (now - lastSampleRef.current >= TRACK_SAMPLE_INTERVAL_MS) {
            lastSampleRef.current = now;
            trackRef.current.push({ ts: now, lat: latitude, lng: longitude, speed: speedKmh, lean: currentLean });
          }

          onPositionRef.current?.({ lat: latitude, lng: longitude, speedKmh });
        },
        () => {
          /* Fehler ignorieren, Aufzeichnung läuft ohne diesen Punkt weiter */
        },
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 },
      );
    }

    if (tickIntervalRef.current === null) {
      tickIntervalRef.current = setInterval(() => {
        if (segmentStartRef.current !== null) {
          setDurationS(Math.floor((accumulatedMsRef.current + (Date.now() - segmentStartRef.current)) / 1000));
        }
      }, 1000);
    }
  }, [currentLean]);

  const stopWatchers = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (tickIntervalRef.current !== null) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    const now = Date.now();
    startedAtRef.current = now;
    segmentStartRef.current = now;
    accumulatedMsRef.current = 0;
    lastSampleRef.current = 0;
    lastPositionRef.current = null;
    trackRef.current = [];
    speedSumRef.current = 0;
    speedSamplesRef.current = 0;
    setDistanceM(0);
    setDurationS(0);
    setMaxSpeedKmh(0);
    setMaxLeanLeft(0);
    setMaxLeanRight(0);
    setCurrentSpeed(0);
    setStatus('recording');
    startWatchers();
  }, [startWatchers]);

  const pause = useCallback(() => {
    if (segmentStartRef.current !== null) {
      accumulatedMsRef.current += Date.now() - segmentStartRef.current;
      segmentStartRef.current = null;
    }
    stopWatchers();
    setStatus('paused');
  }, [stopWatchers]);

  const resume = useCallback(() => {
    segmentStartRef.current = Date.now();
    setStatus('recording');
    startWatchers();
  }, [startWatchers]);

  const stop = useCallback((): RideSummary | null => {
    if (segmentStartRef.current !== null) {
      accumulatedMsRef.current += Date.now() - segmentStartRef.current;
      segmentStartRef.current = null;
    }
    stopWatchers();
    setStatus('finished');

    if (!startedAtRef.current) return null;

    const endedAt = Date.now();
    const finalDurationS = Math.max(1, Math.floor(accumulatedMsRef.current / 1000));
    const avgSpeed = speedSamplesRef.current > 0 ? speedSumRef.current / speedSamplesRef.current : 0;

    const summary: RideSummary = {
      startedAt: startedAtRef.current,
      endedAt,
      durationS: finalDurationS,
      distanceM,
      maxSpeedKmh,
      avgSpeedKmh: avgSpeed,
      maxLeanLeft,
      maxLeanRight,
      track: trackRef.current,
    };
    setDurationS(finalDurationS);
    return summary;
  }, [distanceM, maxSpeedKmh, maxLeanLeft, maxLeanRight]);

  const reset = useCallback(() => {
    setStatus('idle');
    setDistanceM(0);
    setDurationS(0);
    setMaxSpeedKmh(0);
    setMaxLeanLeft(0);
    setMaxLeanRight(0);
    setCurrentSpeed(0);
    setCurrentLean(0);
    startedAtRef.current = null;
  }, []);

  useEffect(() => stopWatchers, [stopWatchers]);

  return {
    status,
    motionPermission,
    geoPermission,
    calibrationOffset,
    rawGamma,
    currentSpeed,
    currentLean,
    distanceM,
    durationS,
    maxSpeedKmh,
    maxLeanLeft,
    maxLeanRight,
    requestPermissions,
    calibrate,
    start,
    pause,
    resume,
    stop,
    reset,
  };
}
