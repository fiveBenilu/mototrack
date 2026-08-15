import { useCallback, useEffect, useRef, useState } from 'react';
import { haversineDistance, msToKmh } from '../lib/geo';
import { saveDraft, clearDraft } from '../lib/rideDraft';
import { gravityFromOrientation, computeBikeFrame, leanAngle, type BikeFrame } from '../lib/lean';

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
  maxG: number;
  track: TrackPoint[];
}

const MIN_SPEED_FOR_LEAN_KMH = 8; // unterhalb dieser Geschwindigkeit zählt Schräglage nicht (Stillstand/Rangieren)
const TRACK_SAMPLE_INTERVAL_MS = 1000;
const GRAVITY = 9.80665; // m/s² → Umrechnung Beschleunigung in G
const G_SMOOTHING = 0.8; // Tiefpass gegen Vibrations-Spitzen (0..1, höher = träger)
const G_UPDATE_INTERVAL_MS = 100; // State-Updates der Live-G-Anzeige drosseln

// Was bei jedem GPS-Punkt nach außen gemeldet wird. Neben der Position auch die
// Live-Telemetrie, damit Freunde im Konvoi mehr sehen als nur einen Punkt.
export interface PositionUpdate {
  lat: number;
  lng: number;
  speedKmh: number;
  leanDeg: number;
  distanceM: number;
  maxSpeedKmh: number;
}

export interface RecorderOptions {
  onPosition?: (pos: PositionUpdate) => void;
}

export function useRideRecorder(options: RecorderOptions = {}) {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [motionPermission, setMotionPermission] = useState<PermissionState>('unknown');
  const [geoPermission, setGeoPermission] = useState<PermissionState>('unknown');
  // Kalibriertes Fahrzeug-Koordinatensystem (null = noch nicht kalibriert).
  const [calibrationOffset, setCalibrationOffset] = useState<BikeFrame | null>(null);

  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [currentLean, setCurrentLean] = useState(0);
  const [rawGamma, setRawGamma] = useState<number | null>(null);
  const [distanceM, setDistanceM] = useState(0);
  const [durationS, setDurationS] = useState(0);
  const [maxSpeedKmh, setMaxSpeedKmh] = useState(0);
  const [maxLeanLeft, setMaxLeanLeft] = useState(0);
  const [maxLeanRight, setMaxLeanRight] = useState(0);
  const [currentG, setCurrentG] = useState(1);
  const [maxG, setMaxG] = useState(0);

  const watchIdRef = useRef<number | null>(null);
  const lastPositionRef = useRef<GeolocationCoordinates | null>(null);
  const lastPositionTimeRef = useRef<number>(0);
  const recordingRef = useRef(false);
  const currentLeanRef = useRef(0);
  const maxLeanLeftRef = useRef(0);
  const maxLeanRightRef = useRef(0);
  const trackRef = useRef<TrackPoint[]>([]);
  const lastSampleRef = useRef(0);
  const accumulatedMsRef = useRef(0);
  const segmentStartRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const speedSumRef = useRef(0);
  const speedSamplesRef = useRef(0);
  const distanceRef = useRef(0);
  const maxSpeedRef = useRef(0);
  const currentGRef = useRef(1);
  const maxGRef = useRef(0);
  const lastGUpdateRef = useRef(0);
  const calibrationRef = useRef<BikeFrame | null>(null);
  const lastOrientationRef = useRef<{ beta: number; gamma: number } | null>(null);
  const currentSpeedRef = useRef(0);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onPositionRef = useRef<RecorderOptions['onPosition']>(undefined);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

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

    // DeviceOrientation/Motion (iOS 13+ erfordert expliziten Aufruf in einem Button-Tap).
    // Orientierung (Schräglage) und Motion (G-Kräfte) teilen sich auf iOS dieselbe
    // Berechtigung – wir fragen beide an, damit auch `devicemotion`-Events fließen.
    const DOE = (window as any).DeviceOrientationEvent;
    const DME = (window as any).DeviceMotionEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      try {
        const result: string = await DOE.requestPermission();
        setMotionPermission(result === 'granted' ? 'granted' : 'denied');
        if (DME && typeof DME.requestPermission === 'function') {
          try {
            await DME.requestPermission();
          } catch {
            /* Motion-Permission deckt iOS i. d. R. dieselbe Freigabe ab */
          }
        }
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

  // Aktuelle (aufrechte) Orientierung als Nullposition festhalten und daraus das
  // Fahrzeug-Koordinatensystem ableiten. Ab dann misst leanAngle die reine
  // Roll-Drehung – unabhängig davon, wie geneigt das Telefon montiert ist.
  const calibrate = useCallback(() => {
    const o = lastOrientationRef.current;
    if (!o) return false;
    const frame = computeBikeFrame(gravityFromOrientation(o.beta, o.gamma));
    calibrationRef.current = frame;
    setCalibrationOffset(frame);
    return true;
  }, []);

  // --- Orientation handling -------------------------------------------------

  useEffect(() => {
    function onOrientation(event: DeviceOrientationEvent) {
      if (event.gamma === null || event.beta === null) return;
      lastOrientationRef.current = { beta: event.beta, gamma: event.gamma };
      setRawGamma(event.gamma);

      // Vor der Kalibrierung 0° anzeigen; danach echte Schräglage aus dem
      // rekonstruierten Schwerkraftvektor relativ zur Nullposition.
      const frame = calibrationRef.current;
      const lean = frame ? leanAngle(frame, gravityFromOrientation(event.beta, event.gamma)) : 0;
      currentLeanRef.current = lean;
      setCurrentLean(lean);

      // Max-Schräglage nur während einer laufenden Aufzeichnung und ab einer
      // relevanten Geschwindigkeit werten (verhindert, dass Kippeln im Stand
      // oder vor dem Start als Schräglage gezählt wird).
      if (recordingRef.current && currentSpeedRef.current >= MIN_SPEED_FOR_LEAN_KMH) {
        if (lean < 0) {
          if (-lean > maxLeanLeftRef.current) {
            maxLeanLeftRef.current = -lean;
            setMaxLeanLeft(-lean);
          }
        } else if (lean > maxLeanRightRef.current) {
          maxLeanRightRef.current = lean;
          setMaxLeanRight(lean);
        }
      }
    }

    window.addEventListener('deviceorientation', onOrientation);
    return () => window.removeEventListener('deviceorientation', onOrientation);
  }, []);

  // --- G-Kräfte (Beschleunigungssensor) -------------------------------------
  // Gesamt-G = Betrag des Beschleunigungsvektors (inkl. Schwerkraft) / 9,81.
  // Im Stand ~1 G; steigt bei Bremsen, Beschleunigen und zügiger Kurvenfahrt.
  // Ein Tiefpass glättet Vibrations-Spitzen.
  useEffect(() => {
    function onMotion(event: DeviceMotionEvent) {
      const a = event.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null || a.z == null) return;
      const g = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z) / GRAVITY;
      const smoothed = currentGRef.current * G_SMOOTHING + g * (1 - G_SMOOTHING);
      currentGRef.current = smoothed;

      const now = Date.now();
      if (now - lastGUpdateRef.current >= G_UPDATE_INTERVAL_MS) {
        lastGUpdateRef.current = now;
        setCurrentG(smoothed);
      }

      if (recordingRef.current && currentSpeedRef.current >= MIN_SPEED_FOR_LEAN_KMH && smoothed > maxGRef.current) {
        maxGRef.current = smoothed;
        setMaxG(smoothed);
      }
    }

    window.addEventListener('devicemotion', onMotion);
    return () => window.removeEventListener('devicemotion', onMotion);
  }, []);

  // --- Wake Lock -------------------------------------------------------------
  // Bildschirm während der Aufzeichnung anlassen, damit GPS/Sensoren nicht durch
  // den Standby unterbrochen werden. Das System gibt den Lock beim Wegschalten
  // (Tab im Hintergrund) frei – darum bei Rückkehr neu anfordern, solange läuft.

  const acquireWakeLock = useCallback(async () => {
    const wl = (navigator as any).wakeLock;
    if (!wl || wakeLockRef.current) return;
    try {
      wakeLockRef.current = await wl.request('screen');
      wakeLockRef.current?.addEventListener('release', () => {
        wakeLockRef.current = null;
      });
    } catch {
      /* nicht verfügbar / verweigert – Aufzeichnung läuft trotzdem weiter */
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && recordingRef.current) acquireWakeLock();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [acquireWakeLock]);

  // --- Recording control -----------------------------------------------------

  // Aktuelle Dauer aus den Akkumulatoren berechnen (laufendes Segment + Pausen).
  const computeDurationS = useCallback(() => {
    const running = segmentStartRef.current !== null ? Date.now() - segmentStartRef.current : 0;
    return Math.max(1, Math.floor((accumulatedMsRef.current + running) / 1000));
  }, []);

  // Momentaufnahme der laufenden Fahrt – Felder identisch zur finalen Summary.
  const buildSummary = useCallback((): RideSummary | null => {
    if (!startedAtRef.current) return null;
    const avgSpeed = speedSamplesRef.current > 0 ? speedSumRef.current / speedSamplesRef.current : 0;
    return {
      startedAt: startedAtRef.current,
      endedAt: Date.now(),
      durationS: computeDurationS(),
      distanceM: distanceRef.current,
      maxSpeedKmh: maxSpeedRef.current,
      avgSpeedKmh: avgSpeed,
      maxLeanLeft: maxLeanLeftRef.current,
      maxLeanRight: maxLeanRightRef.current,
      maxG: maxGRef.current,
      track: trackRef.current,
    };
  }, [computeDurationS]);

  const persistDraft = useCallback(() => {
    const summary = buildSummary();
    if (summary) saveDraft({ ...summary, updatedAt: Date.now() });
  }, [buildSummary]);

  const startWatchers = useCallback(() => {
    acquireWakeLock();
    if (watchIdRef.current === null && navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, speed } = pos.coords;
          const now = Date.now();

          let dist = 0;
          if (lastPositionRef.current) {
            dist = haversineDistance(
              lastPositionRef.current.latitude,
              lastPositionRef.current.longitude,
              latitude,
              longitude,
            );
            // GPS-Rauschen bei Stillstand filtern
            if (dist > 1) {
              distanceRef.current += dist;
              setDistanceM(distanceRef.current);
            }
          }

          // Geschwindigkeit bevorzugt vom GPS; viele Geräte/Browser liefern jedoch
          // kein `speed`-Feld → dann aus Strecke/Zeit der letzten beiden Punkte ableiten.
          let speedKmh = speed !== null && speed >= 0 ? msToKmh(speed) : 0;
          if ((speed === null || speed < 0) && lastPositionRef.current) {
            const dtS = (now - lastPositionTimeRef.current) / 1000;
            if (dtS > 0 && dtS < 30) speedKmh = msToKmh(dist / dtS);
          }

          lastPositionRef.current = pos.coords;
          lastPositionTimeRef.current = now;

          setCurrentSpeed(speedKmh);
          currentSpeedRef.current = speedKmh;
          if (speedKmh > maxSpeedRef.current) maxSpeedRef.current = speedKmh;
          setMaxSpeedKmh(maxSpeedRef.current);
          speedSumRef.current += speedKmh;
          speedSamplesRef.current += 1;

          if (now - lastSampleRef.current >= TRACK_SAMPLE_INTERVAL_MS) {
            lastSampleRef.current = now;
            trackRef.current.push({ ts: now, lat: latitude, lng: longitude, speed: speedKmh, lean: currentLeanRef.current });
            // Aktuellen Stand sichern (≈ 1×/Sekunde), damit die Fahrt bei einem
            // Absturz/Neuladen wiederhergestellt werden kann.
            persistDraft();
          }

          onPositionRef.current?.({
            lat: latitude,
            lng: longitude,
            speedKmh,
            leanDeg: currentLeanRef.current,
            distanceM: distanceRef.current,
            maxSpeedKmh: maxSpeedRef.current,
          });
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
  }, [persistDraft, acquireWakeLock]);

  const stopWatchers = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (tickIntervalRef.current !== null) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
    releaseWakeLock();
  }, [releaseWakeLock]);

  const start = useCallback(() => {
    const now = Date.now();
    startedAtRef.current = now;
    segmentStartRef.current = now;
    accumulatedMsRef.current = 0;
    lastSampleRef.current = 0;
    lastPositionRef.current = null;
    lastPositionTimeRef.current = now;
    recordingRef.current = true;
    trackRef.current = [];
    speedSumRef.current = 0;
    speedSamplesRef.current = 0;
    distanceRef.current = 0;
    maxSpeedRef.current = 0;
    maxLeanLeftRef.current = 0;
    maxLeanRightRef.current = 0;
    maxGRef.current = 0;
    setMaxG(0);
    clearDraft();
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
    recordingRef.current = false;
    currentSpeedRef.current = 0;
    persistDraft();
    stopWatchers();
    setStatus('paused');
  }, [stopWatchers, persistDraft]);

  const resume = useCallback(() => {
    segmentStartRef.current = Date.now();
    lastPositionRef.current = null;
    lastPositionTimeRef.current = Date.now();
    recordingRef.current = true;
    setStatus('recording');
    startWatchers();
  }, [startWatchers]);

  const stop = useCallback((): RideSummary | null => {
    if (segmentStartRef.current !== null) {
      accumulatedMsRef.current += Date.now() - segmentStartRef.current;
      segmentStartRef.current = null;
    }
    recordingRef.current = false;
    stopWatchers();
    setStatus('finished');

    const summary = buildSummary();
    if (!summary) return null;

    // Fahrt ist abgeschlossen → Entwurf entfernen, damit sie nicht später
    // fälschlich als „unterbrochen" zur Wiederherstellung angeboten wird.
    clearDraft();
    setDurationS(summary.durationS);
    return summary;
  }, [buildSummary]);

  const reset = useCallback(() => {
    recordingRef.current = false;
    currentSpeedRef.current = 0;
    maxLeanLeftRef.current = 0;
    maxLeanRightRef.current = 0;
    distanceRef.current = 0;
    maxSpeedRef.current = 0;
    maxGRef.current = 0;
    setMaxG(0);
    clearDraft();
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
    currentG,
    maxG,
    requestPermissions,
    calibrate,
    start,
    pause,
    resume,
    stop,
    reset,
  };
}
