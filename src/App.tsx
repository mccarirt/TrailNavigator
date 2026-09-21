import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppSettings, ProjectedPosition, Trail, TurnCue, UserPosition, BreadcrumbPoint } from './types';
import { generateSampleTrails } from './utils/gpxParser';
import {
  calculateBearing,
  computeNavigationTarget,
  findClosestPointOnTrail,
  getPointAtDistance,
  getRelativeDirectionText,
  haversineDistance,
  reverseTrail,
  invertTurnType,
  invertTurnDescription,
  calculateBreadcrumbsDistance,
  resolveRoundTripPosition,
  createRoundTripState,
} from './utils/geo';
import {
  playArrivalFanfare,
  playOffTrailBeep,
  playTurnChime,
  triggerVibration,
  unlockAudio,
  vibrateArrival,
  vibrateOffTrail,
  vibrateTurnCue,
} from './utils/audioVibrate';
import { useWakeLock } from './hooks/useWakeLock';
import { useHeading } from './hooks/useHeading';
import { TrailListScreen } from './components/TrailListScreen';
import { CompassHeader } from './components/CompassHeader';
import { StatsBar, formatTotalTime, formatTimeRemaining } from './components/StatsBar';
import { TrailMap } from './components/TrailMap';
import { OffTrailAlert } from './components/OffTrailAlert';
import { SettingsModal } from './components/SettingsModal';
import { SimulationControls } from './components/SimulationControls';
import { FinishSummaryModal } from './components/FinishSummaryModal';
import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Play,
  Square,
  Settings as SettingsIcon,
  FlaskConical,
  Sun,
  Moon,
  Volume2,
  VolumeX,
  Activity,
  Compass,
  AlertTriangle,
  AlertCircle,
  Clock,
  Radio,
  RotateCcw,
  Repeat,
  Undo2,
  X,
} from 'lucide-react';
import {
  ActiveSession,
  clearActiveSessionFromDB,
  deleteTrailFromDB,
  getActiveSessionFromDB,
  getAllTrailsFromDB,
  migrateFromLocalStorage,
  saveActiveSessionToDB,
  saveAllTrailsToDB,
  saveTrailToDB,
} from './utils/db';

const DEFAULT_SETTINGS: AppSettings = {
  offTrailThreshold: 30, // 30 meters as requested
  offTrailClearThreshold: 20, // 20 meters as requested
  beepEnabled: true,
  vibrateEnabled: true,
  lookAheadDistance: 40, // 40 meters ahead along trail
  highContrastMode: 'dark-slate',
  units: 'imperial', // miles & feet by default; metric available in settings
};

export type GpsState = 'acquiring' | 'ok' | 'denied' | 'unavailable' | 'timeout';

export default function App() {
  // Navigation Screens: 'list' | 'navigate'
  const [currentScreen, setCurrentScreen] = useState<'list' | 'navigate'>('list');

  // GPS State tracking (acquiring / ok / denied / unavailable / timeout)
  const [gpsState, setGpsState] = useState<GpsState>('acquiring');
  const [gpsRetryTrigger, setGpsRetryTrigger] = useState<number>(0);

  // Saved Trails (IndexedDB)
  const [savedTrails, setSavedTrails] = useState<Trail[]>(() => generateSampleTrails());
  const [resumableSession, setResumableSession] = useState<{
    session: ActiveSession;
    trail: Trail;
  } | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  // Active Selected Trail
  const [activeTrail, setActiveTrail] = useState<Trail | null>(null);

  // Settings
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const stored = localStorage.getItem('trailnav_settings');
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch {}
    return DEFAULT_SETTINGS;
  });

  // Apply the active theme's design tokens (see src/index.css) to the document root
  useEffect(() => {
    document.documentElement.setAttribute(
      'data-theme',
      settings.highContrastMode === 'sunlight-bright' ? 'day' : 'night'
    );
  }, [settings.highContrastMode]);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Navigation State
  const [isNavigating, setIsNavigating] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const elapsedSecondsRef = useRef<number>(0);
  const navStartTimeRef = useRef<number | null>(null);
  const navStartDistanceRef = useRef<number | null>(null);
  const progressHistoryRef = useRef<Array<{ timestamp: number; distanceAlongTrail: number }>>([]);
  const [smoothedPaceSecPerKm, setSmoothedPaceSecPerKm] = useState<number | null>(null);
  const [estimatedTimeRemainingSec, setEstimatedTimeRemainingSec] = useState<number | null>(null);
  const [followMe, setFollowMe] = useState(true);

  // Finish Summary State (within 25m of trail end)
  const [finishSummary, setFinishSummary] = useState<{
    isOpen: boolean;
    time: number;
    distance: number;
    gain: number;
  } | null>(null);
  const hasArrivedRef = useRef<boolean>(false);

  // Map & HUD panel slide states (off screen by default to give map maximum space)
  const [isStatsVisible, setIsStatsVisible] = useState(false);
  const [isCompassVisible, setIsCompassVisible] = useState(false);

  // Live User Position
  const [userPosition, setUserPosition] = useState<UserPosition | null>(null);

  // Live "My Route" Breadcrumb Segments
  const [breadcrumbSegments, setBreadcrumbSegments] = useState<BreadcrumbPoint[][]>([]);
  const breadcrumbSegmentsRef = useRef<BreadcrumbPoint[][]>([]);

  const distanceActuallyWalked = useMemo(() => {
    return calculateBreadcrumbsDistance(breadcrumbSegments);
  }, [breadcrumbSegments]);

  // Off-Trail Alert state
  const [isOffTrailAlertActive, setIsOffTrailAlertActive] = useState(false);
  const [isAlertAudioMuted, setIsAlertAudioMuted] = useState(false);
  const offTrailCountRef = useRef<number>(0);
  const lastDistanceAlongRef = useRef<number | null>(null);
  const lastProcessedTimestampRef = useRef<number | null>(null);
  const lastAlertFeedbackTimeRef = useRef<number>(0);
  const alertDismissedAtRef = useRef<number | null>(null);
  const hasBeenWithinClearThresholdSinceDismissRef = useRef<boolean>(true);

  // Turn Cue Warning Trackers (at 100m and 30m)
  const warned100mTurnsRef = useRef<Set<string>>(new Set());
  const warned30mTurnsRef = useRef<Set<string>>(new Set());

  // Screen Wake Lock hook
  const isScreenLocked = useWakeLock(isNavigating);

  // Heading & Compass Hook
  const {
    heading,
    headingSource,
    needsPermission: needsSensorPermission,
    requestPermission: requestCompassPermission,
  } = useHeading(userPosition?.heading, userPosition?.speed);

  // Reverse mode for non-round trips
  const [isReverseMode, setIsReverseMode] = useState(false);
  // Turn around notice banner
  const [turnAroundNotice, setTurnAroundNotice] = useState<string | null>(null);

  // Round-trip leg tracking ('outbound' | 'return')
  const currentLegRef = useRef<'outbound' | 'return'>('outbound');

  // Round-trip leg tracker state (bearing + progress-trend evidence, see resolveRoundTripPosition)
  const roundTripStateRef = useRef(createRoundTripState());
  // Last confident direction of travel, kept while standing still or moving too little to measure a bearing
  const lastConfidentBearingRef = useRef<number | undefined>(undefined);
  // Memoized projection for the current fix, so re-renders never process the same fix twice
  const projectionCacheRef = useRef<{ key: string; value: ProjectedPosition | null } | null>(null);
  // Notice raised while computing a projection; shown from an effect (never set state during render)
  const pendingNoticeRef = useRef<string | null>(null);
  // Furthest straight-line distance from the trail start (used to detect returning to the trailhead)
  const maxDistFromStartRef = useRef<number>(0);

  // Accepted GPS fixes for computing movementBearing when fixes > 5m apart
  const acceptedFixesRef = useRef<Array<{ lat: number; lon: number; timestamp: number }>>([]);

  // Progress history for non-round trip reverse mode detection (net progress over 40 m of movement)
  const reverseProgressFixesRef = useRef<Array<{
    lat: number;
    lon: number;
    distAlong: number;
    timestamp: number;
  }>>([]);

  // Desk Test Simulation State
  const [isSimulationMode, setIsSimulationMode] = useState(false);
  const [isSimulatingWalk, setIsSimulatingWalk] = useState(false);
  const [simSpeedKmh, setSimSpeedKmh] = useState(5); // walking 5 km/h
  const [simCumDistance, setSimCumDistance] = useState(0);
  const [simWalkingDirection, setSimWalkingDirection] = useState<1 | -1>(1);
  const [isDriftingOffTrail, setIsDriftingOffTrail] = useState(false);

  // Auto-dismiss turn-around notice
  useEffect(() => {
    if (!turnAroundNotice) return;
    const t = setTimeout(() => setTurnAroundNotice(null), 6000);
    return () => clearTimeout(t);
  }, [turnAroundNotice]);

  // Keep elapsedSecondsRef in sync
  useEffect(() => {
    elapsedSecondsRef.current = elapsedSeconds;
  }, [elapsedSeconds]);

  const showErrorToast = useCallback((msg: string) => {
    setErrorToast(msg);
  }, []);

  // Auto-dismiss error toast
  useEffect(() => {
    if (!errorToast) return;
    const timer = setTimeout(() => setErrorToast(null), 6000);
    return () => clearTimeout(timer);
  }, [errorToast]);

  // Load saved trails and check for resumable session from IndexedDB on initial mount
  useEffect(() => {
    let isMounted = true;
    async function initStorage() {
      try {
        const migrated = await migrateFromLocalStorage();
        let trails = await getAllTrailsFromDB();
        if (trails.length === 0) {
          if (migrated && migrated.length > 0) {
            trails = migrated;
          } else {
            trails = generateSampleTrails();
            await saveAllTrailsToDB(trails);
          }
        }

        if (isMounted) {
          setSavedTrails(trails);
          setActiveTrail(prev => prev || trails[0] || null);
        }

        // Check for active session to resume
        const session = await getActiveSessionFromDB();
        if (session && session.isNavigating && session.trailId) {
          const match = trails.find(t => t.id === session.trailId);
          if (match && isMounted) {
            setResumableSession({
              session,
              trail: match,
            });
          }
        }
      } catch (err: unknown) {
        console.error('Failed to initialize IndexedDB:', err);
        const msg = err instanceof Error ? err.message : 'Database error';
        if (isMounted) {
          showErrorToast(`Failed to load saved trails: ${msg}`);
        }
      }
    }

    initStorage();
    return () => {
      isMounted = false;
    };
  }, [showErrorToast]);

  // Persist active session (trail id, elapsed seconds, isNavigating, lastDistanceAlong) every 10 s
  useEffect(() => {
    if (!isNavigating || !activeTrail) return;

    const persistActiveSession = async () => {
      try {
        await saveActiveSessionToDB({
          trailId: activeTrail.id,
          elapsedSeconds: elapsedSecondsRef.current,
          isNavigating: true,
          lastDistanceAlong: lastDistanceAlongRef.current,
          updatedAt: Date.now(),
          breadcrumbs: breadcrumbSegmentsRef.current,
        });
      } catch (err: unknown) {
        console.warn('Failed to persist active session to IndexedDB:', err);
      }
    };

    // Run once immediately on navigation start/state change
    persistActiveSession();
    const interval = setInterval(persistActiveSession, 10000);
    return () => clearInterval(interval);
  }, [isNavigating, activeTrail]);

  // Persist settings
  useEffect(() => {
    try {
      localStorage.setItem('trailnav_settings', JSON.stringify(settings));
    } catch (e) {
      console.warn('Failed to persist settings:', e);
    }
  }, [settings]);

  // Save or Update Trail in IndexedDB
  const handleSaveTrail = async (newTrail: Trail) => {
    try {
      await saveTrailToDB(newTrail);
      setSavedTrails(prev => {
        const exists = prev.some(t => t.id === newTrail.id);
        if (exists) {
          return prev.map(t => (t.id === newTrail.id ? newTrail : t));
        }
        return [newTrail, ...prev];
      });
    } catch (err: unknown) {
      console.error('Failed to save trail to IndexedDB:', err);
      const msg = err instanceof Error ? err.message : 'Storage quota or write error';
      showErrorToast(`Failed to save trail: ${msg}`);
    }
  };

  // Delete Trail from IndexedDB
  const handleDeleteTrail = async (trailId: string) => {
    try {
      await deleteTrailFromDB(trailId);
      setSavedTrails(prev => prev.filter(t => t.id !== trailId));
      if (activeTrail?.id === trailId) {
        const remaining = savedTrails.filter(t => t.id !== trailId);
        setActiveTrail(remaining[0] || null);
      }
      if (resumableSession?.session.trailId === trailId) {
        await clearActiveSessionFromDB();
        setResumableSession(null);
      }
    } catch (err: unknown) {
      console.error('Failed to delete trail from IndexedDB:', err);
      const msg = err instanceof Error ? err.message : 'Database error';
      showErrorToast(`Failed to delete trail: ${msg}`);
    }
  };

  // Resume Hike after reload
  const handleResumeHike = () => {
    if (!resumableSession) return;
    const { session, trail } = resumableSession;
    setActiveTrail(trail);
    setCurrentScreen('navigate');
    setElapsedSeconds(session.elapsedSeconds);
    navStartTimeRef.current = Date.now() - session.elapsedSeconds * 1000;
    setIsNavigating(true);
    lastDistanceAlongRef.current = session.lastDistanceAlong;
    navStartDistanceRef.current = session.lastDistanceAlong;
    warned100mTurnsRef.current.clear();
    warned30mTurnsRef.current.clear();
    hasArrivedRef.current = false;
    setFinishSummary(null);
    offTrailCountRef.current = 0;
    setIsOffTrailAlertActive(false);

    if (session.breadcrumbs && session.breadcrumbs.length > 0) {
      setBreadcrumbSegments(session.breadcrumbs);
      breadcrumbSegmentsRef.current = session.breadcrumbs;
    } else {
      setBreadcrumbSegments([]);
      breadcrumbSegmentsRef.current = [];
    }

    if (trail.points.length > 0) {
      const pt = getPointAtDistance(trail.points, session.lastDistanceAlong ?? 0);
      setUserPosition({
        lat: pt.lat,
        lon: pt.lon,
        accuracy: 10,
        altitude: pt.ele,
        speed: 1.2,
        heading: 0,
        timestamp: Date.now(),
      });
    }
    setResumableSession(null);
  };

  const handleDiscardSession = async () => {
    try {
      await clearActiveSessionFromDB();
    } catch (err) {
      console.warn('Failed to clear active session:', err);
    }
    setBreadcrumbSegments([]);
    breadcrumbSegmentsRef.current = [];
    setResumableSession(null);
  };

  // Select Trail to Navigate
  const handleSelectTrail = (trail: Trail) => {
    setActiveTrail(trail);
    setCurrentScreen('navigate');
    setIsDriftingOffTrail(false);
    warned100mTurnsRef.current.clear();
    warned30mTurnsRef.current.clear();
    hasArrivedRef.current = false;
    setFinishSummary(null);
    offTrailCountRef.current = 0;
    lastDistanceAlongRef.current = null;
    navStartDistanceRef.current = null;
    lastProcessedTimestampRef.current = null;
    lastAlertFeedbackTimeRef.current = 0;
    alertDismissedAtRef.current = null;
    hasBeenWithinClearThresholdSinceDismissRef.current = true;
    setIsOffTrailAlertActive(false);
    setElapsedSeconds(0);
    setBreadcrumbSegments([]);
    breadcrumbSegmentsRef.current = [];
    progressHistoryRef.current = [];
    currentLegRef.current = 'outbound';
    roundTripStateRef.current = createRoundTripState();
    lastConfidentBearingRef.current = undefined;
    projectionCacheRef.current = null;
    maxDistFromStartRef.current = 0;
    acceptedFixesRef.current = [];
    reverseProgressFixesRef.current = [];
    setIsReverseMode(false);
    setTurnAroundNotice(null);
    setSimWalkingDirection(1);
    setSmoothedPaceSecPerKm(null);
    setEstimatedTimeRemainingSec(null);

    // In real GPS mode, don't set the fake trail-start userPosition; leave it null until the first real fix.
    if (isSimulationMode && trail.points.length > 0) {
      // Start from nearest point if user position is available, otherwise index 0
      const nearest = userPosition
        ? findClosestPointOnTrail(userPosition.lat, userPosition.lon, trail.points, trail.totalDistance)
        : null;
      const startPt = nearest ? nearest.point : trail.points[0];
      const startDist = nearest ? nearest.distanceAlongTrail : 0;

      setUserPosition({
        lat: startPt.lat,
        lon: startPt.lon,
        accuracy: 10,
        altitude: startPt.ele,
        speed: 0,
        heading: 0,
        timestamp: Date.now(),
      });
      setSimCumDistance(startDist);
      lastDistanceAlongRef.current = startDist;
      navStartDistanceRef.current = startDist;
      setGpsState('ok');
    } else {
      setUserPosition(null);
      setSimCumDistance(0);
      setGpsState('acquiring');
    }
  };

  // Reverse Trail Direction
  const handleReverseTrail = (trailToReverse?: Trail) => {
    const target = trailToReverse || activeTrail;
    if (!target || target.points.length < 2) return;

    const reversed = reverseTrail(target);

    // If active trail is being reversed
    if (activeTrail && target.id === activeTrail.id) {
      setActiveTrail(reversed);
      warned100mTurnsRef.current.clear();
      warned30mTurnsRef.current.clear();
      hasArrivedRef.current = false;
      progressHistoryRef.current = [];

      // Recalculate nearest point on the reversed trail
      if (userPosition) {
        const nearest = findClosestPointOnTrail(
          userPosition.lat,
          userPosition.lon,
          reversed.points,
          reversed.totalDistance
        );
        if (nearest) {
          lastDistanceAlongRef.current = nearest.distanceAlongTrail;
          navStartDistanceRef.current = nearest.distanceAlongTrail;
          if (isSimulationMode) {
            setSimCumDistance(nearest.distanceAlongTrail);
          }
        }
      }
    }

    // Update in saved trails state and IndexedDB
    saveTrailToDB(reversed).catch(console.warn);
    setSavedTrails(prev => {
      const exists = prev.some(t => t.id === target.id);
      if (exists) {
        return prev.map(t => (t.id === target.id ? reversed : t));
      }
      return prev;
    });
  };

  // Toggle Theme Mode
  const handleChangeUnits = (units: 'imperial' | 'metric') => {
    setSettings(prev => ({ ...prev, units }));
  };

  const handleToggleTheme = () => {
    setSettings(prev => ({
      ...prev,
      highContrastMode:
        prev.highContrastMode === 'dark-slate' ? 'sunlight-bright' : 'dark-slate',
    }));
  };

  // Toggle Navigation (Start / Stop)
  const handleToggleNavigation = () => {
    unlockAudio();
    if (!isNavigating) {
      setIsNavigating(true);
      navStartTimeRef.current = Date.now() - elapsedSeconds * 1000;
      setBreadcrumbSegments([]);
      breadcrumbSegmentsRef.current = [];
      hasArrivedRef.current = false;
      setFinishSummary(null);
      warned100mTurnsRef.current.clear();
      warned30mTurnsRef.current.clear();
      progressHistoryRef.current = [];
      currentLegRef.current = 'outbound';
      roundTripStateRef.current = createRoundTripState();
      lastConfidentBearingRef.current = undefined;
      projectionCacheRef.current = null;
      maxDistFromStartRef.current = 0;
      acceptedFixesRef.current = [];
      reverseProgressFixesRef.current = [];
      setIsReverseMode(false);
      setTurnAroundNotice(null);
      setSimWalkingDirection(1);

      // Start from the nearest point on the trail instead of the trail start
      if (activeTrail && activeTrail.points.length > 0) {
        if (userPosition) {
          const nearest = findClosestPointOnTrail(
            userPosition.lat,
            userPosition.lon,
            activeTrail.points,
            activeTrail.totalDistance
          );
          if (nearest) {
            lastDistanceAlongRef.current = nearest.distanceAlongTrail;
            navStartDistanceRef.current = nearest.distanceAlongTrail;
            if (isSimulationMode) {
              setSimCumDistance(nearest.distanceAlongTrail);
            }
          }
        } else {
          lastDistanceAlongRef.current = null;
          navStartDistanceRef.current = null;
        }
      }

      // Auto-start simulation if in test mode
      if (isSimulationMode) {
        setIsSimulatingWalk(true);
      }
    } else {
      setIsNavigating(false);
      navStartTimeRef.current = null;
      setIsSimulatingWalk(false);
      setIsOffTrailAlertActive(false);
      offTrailCountRef.current = 0;
      lastDistanceAlongRef.current = null;
      navStartDistanceRef.current = null;
      lastProcessedTimestampRef.current = null;
      lastAlertFeedbackTimeRef.current = 0;
      alertDismissedAtRef.current = null;
      hasBeenWithinClearThresholdSinceDismissRef.current = true;
      progressHistoryRef.current = [];
      clearActiveSessionFromDB().catch(console.warn);
      setResumableSession(null);
    }
  };

  // Real Geolocation watchPosition
  useEffect(() => {
    if (currentScreen !== 'navigate' || isSimulationMode) {
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsState('unavailable');
      return;
    }

    // Mark acquiring if we don't have an active position yet
    setGpsState(prev => (prev === 'ok' ? 'ok' : 'acquiring'));

    const watchId = navigator.geolocation.watchPosition(
      pos => {
        setGpsState('ok');
        const newPos: UserPosition = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude,
          speed: pos.coords.speed,
          heading: pos.coords.heading,
          timestamp: pos.timestamp,
        };
        setUserPosition(newPos);

        // Snap navigation start to nearest point on trail upon first fix
        if (activeTrail && activeTrail.points.length > 0 && navStartDistanceRef.current === null) {
          const nearest = findClosestPointOnTrail(
            newPos.lat,
            newPos.lon,
            activeTrail.points,
            activeTrail.totalDistance
          );
          if (nearest) {
            lastDistanceAlongRef.current = nearest.distanceAlongTrail;
            navStartDistanceRef.current = nearest.distanceAlongTrail;
          }
        }
      },
      err => {
        console.warn('Geolocation watchPosition error:', err);
        if (err.code === 1) {
          // PERMISSION_DENIED
          setGpsState('denied');
        } else if (err.code === 2) {
          // POSITION_UNAVAILABLE
          setGpsState('unavailable');
        } else if (err.code === 3) {
          // TIMEOUT
          setGpsState('timeout');
        } else {
          setGpsState('unavailable');
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [currentScreen, isSimulationMode, gpsRetryTrigger]);

  // Desk Test Simulation Loop
  useEffect(() => {
    if (!isSimulationMode || !isSimulatingWalk || !activeTrail || activeTrail.points.length < 2) {
      return;
    }

    const intervalMs = 250;
    const intervalSec = intervalMs / 1000;
    const speedMps = (simSpeedKmh * 1000) / 3600;

    const timer = setInterval(() => {
      setSimCumDistance(prevDist => {
        const nextDist = prevDist + simWalkingDirection * speedMps * intervalSec;
        const total = activeTrail.totalDistance;
        let clampedDist = nextDist;
        if (simWalkingDirection > 0) {
          if (nextDist > total) clampedDist = 0; // loop trail or reach end
        } else {
          if (nextDist < 0) clampedDist = 0; // reached start in reverse
        }

        const pt = getPointAtDistance(activeTrail.points, clampedDist);
        const lookaheadPt =
          simWalkingDirection > 0
            ? getPointAtDistance(activeTrail.points, Math.min(total, clampedDist + 5))
            : getPointAtDistance(activeTrail.points, Math.max(0, clampedDist - 5));
        const bearingAhead = calculateBearing(pt.lat, pt.lon, lookaheadPt.lat, lookaheadPt.lon);

        let finalLat = pt.lat;
        let finalLon = pt.lon;

        // Apply simulated drift (+45 meters perpendicular) if enabled
        if (isDriftingOffTrail) {
          const perpBearing = (bearingAhead + 90) % 360;
          const rad = (perpBearing * Math.PI) / 180;
          const earthRadius = 6371000;
          const driftMeters = 45;

          finalLat += (driftMeters / earthRadius) * (180 / Math.PI) * Math.cos(rad);
          finalLon +=
            ((driftMeters / earthRadius) * (180 / Math.PI) * Math.sin(rad)) /
            Math.cos((finalLat * Math.PI) / 180);
        }

        setUserPosition({
          lat: finalLat,
          lon: finalLon,
          accuracy: 5,
          altitude: pt.ele,
          speed: speedMps,
          heading: bearingAhead,
          timestamp: Date.now(),
        });

        return clampedDist;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [
    isSimulationMode,
    isSimulatingWalk,
    simSpeedKmh,
    simWalkingDirection,
    isDriftingOffTrail,
    activeTrail,
  ]);

  // Track accepted fixes for computing movementBearing when fixes > 5 m apart
  useEffect(() => {
    if (!userPosition) return;
    const accuracy = userPosition.accuracy ?? 0;
    if (accuracy <= 50) {
      const fixes = acceptedFixesRef.current;
      const lastFix = fixes[fixes.length - 1];
      if (!lastFix || lastFix.lat !== userPosition.lat || lastFix.lon !== userPosition.lon) {
        fixes.push({
          lat: userPosition.lat,
          lon: userPosition.lon,
          timestamp: userPosition.timestamp,
        });
        if (fixes.length > 50) {
          fixes.shift();
        }
      }
    }
  }, [userPosition]);

  // Live "My Route" Breadcrumbs Recording
  // Keeps breadcrumb array of accepted GPS/simulation fixes:
  // - Accept only if accuracy <= 50m and >= 5m from last recorded point
  // - Split into new segment if > 60s between fixes or jump > 100m
  // - Active for real navigation and preview simulation
  useEffect(() => {
    if (!userPosition) return;
    if (!isNavigating && !isSimulatingWalk) return;

    const acc = userPosition.accuracy;
    if (acc === null || acc === undefined || isNaN(acc) || acc > 50) {
      return;
    }

    const segments = breadcrumbSegmentsRef.current;
    const lastSeg = segments.length > 0 ? segments[segments.length - 1] : null;
    const lastPt = lastSeg && lastSeg.length > 0 ? lastSeg[lastSeg.length - 1] : null;

    const newPt: BreadcrumbPoint = {
      lat: userPosition.lat,
      lon: userPosition.lon,
      timestamp: userPosition.timestamp,
      accuracy: acc,
    };

    if (lastPt) {
      const dist = haversineDistance(lastPt.lat, lastPt.lon, userPosition.lat, userPosition.lon);
      if (dist < 5) {
        return;
      }

      const timeGapMs = userPosition.timestamp - lastPt.timestamp;
      const shouldSplit = timeGapMs > 60000 || dist > 100;

      let next: BreadcrumbPoint[][];
      if (shouldSplit) {
        next = [...segments, [newPt]];
      } else {
        next = [...segments.slice(0, -1), [...lastSeg!, newPt]];
      }
      breadcrumbSegmentsRef.current = next;
      setBreadcrumbSegments(next);
    } else {
      const next = [[newPt]];
      breadcrumbSegmentsRef.current = next;
      setBreadcrumbSegments(next);
    }
  }, [userPosition, isNavigating, isSimulatingWalk]);

  // movementBearing (direction of travel):
  //  1. GPS heading when moving faster than 0.7 m/s
  //  2. otherwise the bearing over the last >= 25 m of travelled path (>= 15 m in a straight line),
  //     which is long enough to average out GPS jitter
  //  3. otherwise the last confident bearing (standing still, or too little movement to tell)
  const movementBearing = useMemo(() => {
    if (!userPosition) return undefined;

    if (
      userPosition.speed !== null &&
      userPosition.speed !== undefined &&
      userPosition.speed > 0.7 &&
      userPosition.heading !== null &&
      userPosition.heading !== undefined &&
      !isNaN(userPosition.heading)
    ) {
      lastConfidentBearingRef.current = userPosition.heading;
      return userPosition.heading;
    }

    const fixes = acceptedFixesRef.current;
    let pathLen = 0;
    let prevLat = userPosition.lat;
    let prevLon = userPosition.lon;
    for (let i = fixes.length - 1; i >= 0; i--) {
      pathLen += haversineDistance(fixes[i].lat, fixes[i].lon, prevLat, prevLon);
      prevLat = fixes[i].lat;
      prevLon = fixes[i].lon;
      if (
        pathLen >= 25 &&
        haversineDistance(fixes[i].lat, fixes[i].lon, userPosition.lat, userPosition.lon) >= 15
      ) {
        const b = calculateBearing(fixes[i].lat, fixes[i].lon, userPosition.lat, userPosition.lon);
        lastConfidentBearingRef.current = b;
        return b;
      }
    }

    return lastConfidentBearingRef.current;
  }, [userPosition]);

  // Closest point projection on trail.
  // - Normal trails: search a window around the last position (-100 m to +300 m), widening to the whole
  //   trail after 3 consecutive off-trail fixes.
  // - Round trips (out-and-back files): resolveRoundTripPosition decides which leg the hiker is on.
  // The result is cached per GPS fix, so re-renders never count the same fix twice, and any notice is
  // queued in a ref and shown from an effect instead of setting state during render.
  const projectedPosition = useMemo(() => {
    if (!activeTrail || !userPosition) return null;

    const cacheKey = `${activeTrail.id}|${userPosition.timestamp}|${userPosition.lat}|${userPosition.lon}|${isReverseMode}|${offTrailCountRef.current >= 3}`;
    if (projectionCacheRef.current && projectionCacheRef.current.key === cacheKey) {
      return projectionCacheRef.current.value;
    }

    let proj: ProjectedPosition | null;

    if (activeTrail.isRoundTrip && !isReverseMode) {
      const state = roundTripStateRef.current;
      // Other code (start, resume, simulation helpers) sets these refs directly, so sync them in
      state.leg = currentLegRef.current;
      state.lastDistanceAlong = lastDistanceAlongRef.current;

      const result = resolveRoundTripPosition(
        activeTrail,
        userPosition,
        movementBearing,
        state,
        offTrailCountRef.current
      );
      proj = result.proj;
      currentLegRef.current = state.leg;
      lastDistanceAlongRef.current = state.lastDistanceAlong;
      if (result.turnedAround) {
        pendingNoticeRef.current = 'Turned around – heading back to start';
      }
    } else {
      proj = findClosestPointOnTrail(
        userPosition.lat,
        userPosition.lon,
        activeTrail.points,
        activeTrail.totalDistance,
        {
          movementBearing,
          lastDistanceAlong: lastDistanceAlongRef.current ?? undefined,
          isRoundTrip: false,
          consecutiveOffTrailCount: offTrailCountRef.current,
          isReverseMode,
        }
      );
      if (proj) {
        lastDistanceAlongRef.current = proj.distanceAlongTrail;
      }
    }

    projectionCacheRef.current = { key: cacheKey, value: proj };
    return proj;
  }, [activeTrail, userPosition, movementBearing, isReverseMode]);

  // Show queued notices (e.g. "Turned around") outside of render
  useEffect(() => {
    if (pendingNoticeRef.current) {
      setTurnAroundNotice(pendingNoticeRef.current);
      pendingNoticeRef.current = null;
    }
  }, [projectedPosition]);

  // Track how far from the trailhead the hiker has been (for detecting the return to the start)
  useEffect(() => {
    if (!isNavigating || !userPosition || !activeTrail || activeTrail.points.length === 0) return;
    const start = activeTrail.points[0];
    const d = haversineDistance(userPosition.lat, userPosition.lon, start.lat, start.lon);
    if (d > maxDistFromStartRef.current) maxDistFromStartRef.current = d;
  }, [isNavigating, userPosition, activeTrail]);

  // Timer loop for Total Elapsed Time
  useEffect(() => {
    if (!isNavigating) return;
    const timer = setInterval(() => {
      if (navStartTimeRef.current) {
        const elapsed = Math.floor((Date.now() - navStartTimeRef.current) / 1000);
        setElapsedSeconds(elapsed);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [isNavigating]);

  // Reverse mode for non-round trips: switch to reverse when net progress over 40 m of movement is negative
  // (ignore fixes with accuracy > 50 m or speed < 0.3 m/s)
  useEffect(() => {
    if (!isNavigating || !userPosition || !projectedPosition || !activeTrail) return;
    if (activeTrail.isRoundTrip) return;

    const accuracy = userPosition.accuracy ?? 0;
    const speed = userPosition.speed ?? 0;
    if (accuracy > 50 || speed < 0.3) {
      return;
    }

    const currentDist = projectedPosition.distanceAlongTrail;
    const history = reverseProgressFixesRef.current;

    if (history.length > 0 && history[history.length - 1].timestamp === userPosition.timestamp) {
      return;
    }

    history.push({
      lat: userPosition.lat,
      lon: userPosition.lon,
      distAlong: currentDist,
      timestamp: userPosition.timestamp,
    });

    // Calculate cumulative distance moved over fixes in reverse order
    let cumMoved = 0;
    let refIdx = -1;
    for (let i = history.length - 1; i >= 1; i--) {
      cumMoved += haversineDistance(
        history[i].lat,
        history[i].lon,
        history[i - 1].lat,
        history[i - 1].lon
      );
      if (cumMoved >= 40) {
        refIdx = i - 1;
        break;
      }
    }

    if (refIdx > 5) {
      history.splice(0, refIdx - 2);
    }

    if (refIdx >= 0) {
      const refFix = history[refIdx];
      const latestFix = history[history.length - 1];
      const netProgress = latestFix.distAlong - refFix.distAlong;

      if (!isReverseMode && netProgress < -5) {
        setIsReverseMode(true);
        setTurnAroundNotice("Turned around – heading back to start");
      } else if (isReverseMode && netProgress > 5) {
        setIsReverseMode(false);
        setTurnAroundNotice(null);
      }
    }
  }, [isNavigating, userPosition, projectedPosition, activeTrail, isReverseMode]);

  // Effective distance remaining: in reverse mode on non-round trip trails, remaining distance is back to start
  const effectiveDistanceRemaining = useMemo(() => {
    if (!activeTrail || !projectedPosition) return activeTrail?.totalDistance ?? 0;
    if (isReverseMode) {
      return Math.max(0, projectedPosition.distanceAlongTrail);
    }
    return projectedPosition.distanceRemaining;
  }, [activeTrail, projectedPosition, isReverseMode]);

  // Compute Smoothed Pace and Estimated Time Remaining based on distance covered over the last 5 minutes
  useEffect(() => {
    if (!isNavigating || !projectedPosition) {
      progressHistoryRef.current = [];
      setSmoothedPaceSecPerKm(null);
      setEstimatedTimeRemainingSec(null);
      return;
    }

    const now = Date.now();
    const currentDist = projectedPosition.distanceAlongTrail;
    const history = progressHistoryRef.current;

    // Record timestamp and distance along trail
    history.push({ timestamp: now, distanceAlongTrail: currentDist });

    // Prune entries older than 5 minutes (300,000 ms), retaining the boundary point
    const cutoff = now - 5 * 60 * 1000;
    while (history.length > 2 && history[1].timestamp < cutoff) {
      history.shift();
    }

    const oldest = history[0];
    const latest = history[history.length - 1];
    const timeDeltaSec = (latest.timestamp - oldest.timestamp) / 1000;
    const distDeltaMeters = Math.abs(latest.distanceAlongTrail - oldest.distanceAlongTrail);

    // Compute rolling speed from distance covered over the window (requiring at least 4s and 2m of travel)
    if (timeDeltaSec >= 4 && distDeltaMeters >= 1.5) {
      const rollingSpeedMps = distDeltaMeters / timeDeltaSec; // meters / second
      if (rollingSpeedMps > 0.15) {
        const paceSecPerKm = 1000 / rollingSpeedMps;
        setSmoothedPaceSecPerKm(paceSecPerKm);

        const timeRemainingSec = Math.round(effectiveDistanceRemaining / rollingSpeedMps);
        setEstimatedTimeRemainingSec(timeRemainingSec);
      } else {
        setSmoothedPaceSecPerKm(null);
        setEstimatedTimeRemainingSec(null);
      }
    } else if (history.length <= 1) {
      setSmoothedPaceSecPerKm(null);
      setEstimatedTimeRemainingSec(null);
    }
  }, [isNavigating, projectedPosition, effectiveDistanceRemaining]);

  // Off-trail detection logic
  // Count each GPS fix once (key on userPosition.timestamp, not effect runs);
  // Skip fixes with accuracy > 50 m;
  // Use (distanceFromTrail - accuracy) against threshold;
  // Fall back to full search after 3 consecutive off-trail fixes;
  // Beep/vibrate at most once per 10 s while off trail;
  // After user dismisses alert, don't re-alert until they've been within clear threshold once or 2 minutes have passed.
  useEffect(() => {
    if (!isNavigating || !userPosition || !projectedPosition || !activeTrail) return;

    // 1. Count each GPS fix once (key on userPosition.timestamp, not effect runs)
    if (userPosition.timestamp === lastProcessedTimestampRef.current) {
      return;
    }
    lastProcessedTimestampRef.current = userPosition.timestamp;

    // 2. Skip fixes with accuracy > 50 m
    const accuracy = userPosition.accuracy ?? 0;
    if (accuracy > 50) {
      return;
    }

    // 3. Use (distanceFromTrail - accuracy) against the threshold
    const distFromTrail = projectedPosition.distanceFromTrail;
    const adjustedDist = distFromTrail - accuracy;

    if (adjustedDist > settings.offTrailThreshold) {
      offTrailCountRef.current += 1;

      // Fall back to a full search after 3 consecutive off-trail fixes
      if (offTrailCountRef.current === 3) {
        const fullSearchProj = findClosestPointOnTrail(
          userPosition.lat,
          userPosition.lon,
          activeTrail.points,
          activeTrail.totalDistance
        );
        if (fullSearchProj) {
          lastDistanceAlongRef.current = fullSearchProj.distanceAlongTrail;
          if (fullSearchProj.distanceFromTrail - accuracy <= settings.offTrailThreshold) {
            // Snapped to another leg and is actually on trail!
            offTrailCountRef.current = 0;
            if (fullSearchProj.distanceFromTrail <= settings.offTrailClearThreshold) {
              hasBeenWithinClearThresholdSinceDismissRef.current = true;
              alertDismissedAtRef.current = null;
            }
            if (isOffTrailAlertActive) {
              setIsOffTrailAlertActive(false);
            }
            return;
          }
        }
      }

      if (offTrailCountRef.current >= 3) {
        const now = Date.now();
        const dismissedAt = alertDismissedAtRef.current;
        // After user dismisses the alert, don't re-alert until they've been within the clear threshold once or 2 minutes have passed
        const canReAlert =
          dismissedAt === null ||
          hasBeenWithinClearThresholdSinceDismissRef.current ||
          now - dismissedAt >= 2 * 60 * 1000;

        if (canReAlert) {
          setIsOffTrailAlertActive(true);

          // 4. Beep/vibrate at most once per 10 s while off trail
          if (now - lastAlertFeedbackTimeRef.current >= 10000) {
            lastAlertFeedbackTimeRef.current = now;
            if (settings.vibrateEnabled) {
              vibrateOffTrail();
            }
            if (settings.beepEnabled && !isAlertAudioMuted) {
              playOffTrailBeep();
            }
          }
        }
      }
    } else {
      if (!isOffTrailAlertActive) {
        offTrailCountRef.current = 0;
      }
      if (distFromTrail <= settings.offTrailClearThreshold || adjustedDist <= settings.offTrailClearThreshold) {
        offTrailCountRef.current = 0;
        hasBeenWithinClearThresholdSinceDismissRef.current = true;
        alertDismissedAtRef.current = null;
        if (isOffTrailAlertActive) {
          setIsOffTrailAlertActive(false);
        }
      }
    }
  }, [
    isNavigating,
    userPosition,
    projectedPosition,
    activeTrail,
    settings.offTrailThreshold,
    settings.offTrailClearThreshold,
    settings.vibrateEnabled,
    settings.beepEnabled,
    isAlertAudioMuted,
    isOffTrailAlertActive,
  ]);

  // Compass target point computation:
  // On trail: aim 40m ahead along trail (looks back when isReverseMode is true).
  // Off trail: aim at nearest point on trail.
  const isOffTrail =
    isOffTrailAlertActive ||
    (projectedPosition !== null &&
      projectedPosition.distanceFromTrail - (userPosition?.accuracy ?? 0) >
        settings.offTrailThreshold);

  const navigationTarget = useMemo(() => {
    if (!projectedPosition || !activeTrail) return null;
    return computeNavigationTarget(
      projectedPosition,
      activeTrail.points,
      isOffTrail,
      settings.lookAheadDistance,
      isReverseMode
    );
  }, [projectedPosition, activeTrail, isOffTrail, settings.lookAheadDistance, isReverseMode]);

  // Target bearing & compass angle
  const { bearingToTarget, arrowAngle, distanceToTarget } = useMemo(() => {
    if (!userPosition || !navigationTarget) {
      return { bearingToTarget: 0, arrowAngle: 0, distanceToTarget: 0 };
    }

    const b = calculateBearing(
      userPosition.lat,
      userPosition.lon,
      navigationTarget.targetPoint.lat,
      navigationTarget.targetPoint.lon
    );

    const dist = navigationTarget.isReturningToTrail
      ? (projectedPosition?.distanceFromTrail ?? 0)
      : settings.lookAheadDistance;

    // Arrow angle = bearingToTarget - heading
    const angle = b - heading;

    return {
      bearingToTarget: b,
      arrowAngle: angle,
      distanceToTarget: dist,
    };
  }, [userPosition, navigationTarget, heading, projectedPosition, settings.lookAheadDistance]);

  // Direction guidance text
  const directionText = useMemo(() => {
    return getRelativeDirectionText(
      arrowAngle,
      distanceToTarget,
      navigationTarget?.isReturningToTrail ?? false,
      settings.units
    );
  }, [arrowAngle, distanceToTarget, navigationTarget, settings.units]);

  // Next Turn Cue & Distance to it
  // In reverse mode, turn cues are inverted (left <-> right, descriptions inverted, sorted descending)
  const { nextTurnCue, distanceToNextTurn } = useMemo(() => {
    if (!activeTrail || !projectedPosition || activeTrail.turnCues.length === 0) {
      return { nextTurnCue: null, distanceToNextTurn: null };
    }

    const currentDist = projectedPosition.distanceAlongTrail;

    if (isReverseMode) {
      // In reverse mode, user is walking toward start (decreasing cumulative distance)
      const upcoming = activeTrail.turnCues
        .filter(c => c.distanceAlongTrail < currentDist)
        .sort((a, b) => b.distanceAlongTrail - a.distanceAlongTrail); // Closest ahead first

      if (upcoming.length === 0) {
        return { nextTurnCue: null, distanceToNextTurn: null };
      }

      const rawNext = upcoming[0];
      const distToTurn = Math.max(0, currentDist - rawNext.distanceAlongTrail);

      const invertedCue: TurnCue = {
        ...rawNext,
        id: `rev-${rawNext.id}`,
        turnType: invertTurnType(rawNext.turnType),
        bearingChange: -rawNext.bearingChange,
        description: invertTurnDescription(rawNext.description),
      };

      return {
        nextTurnCue: invertedCue,
        distanceToNextTurn: distToTurn,
      };
    } else {
      // Forward navigation
      const upcoming = activeTrail.turnCues.filter(c => c.distanceAlongTrail > currentDist);

      if (upcoming.length === 0) {
        return { nextTurnCue: null, distanceToNextTurn: null };
      }

      const next = upcoming[0];
      const distToTurn = Math.max(0, next.distanceAlongTrail - currentDist);

      return {
        nextTurnCue: next,
        distanceToNextTurn: distToTurn,
      };
    }
  }, [activeTrail, projectedPosition, isReverseMode]);

  // Turn cues for map display (inverted if reverse mode is active)
  const displayTurnCues = useMemo(() => {
    if (!activeTrail) return [];
    if (isReverseMode) {
      return activeTrail.turnCues.map(c => ({
        ...c,
        turnType: invertTurnType(c.turnType),
        bearingChange: -c.bearingChange,
        description: invertTurnDescription(c.description),
      }));
    }
    return activeTrail.turnCues;
  }, [activeTrail, isReverseMode]);

  // Turn cue markers shown on the map: only the next few in the direction of travel, so labels don't pile up
  // (a trail can have dozens of cues, and out-and-backs list every one twice).
  const mapTurnCues = useMemo(() => {
    const along = projectedPosition?.distanceAlongTrail ?? 0;
    const inWindow = displayTurnCues.filter(c =>
      isReverseMode
        ? c.distanceAlongTrail <= along + 20 && c.distanceAlongTrail >= along - 800
        : c.distanceAlongTrail >= along - 20 && c.distanceAlongTrail <= along + 800
    );
    return inWindow
      .sort((a, b) => Math.abs(a.distanceAlongTrail - along) - Math.abs(b.distanceAlongTrail - along))
      .slice(0, 4);
  }, [displayTurnCues, projectedPosition?.distanceAlongTrail, isReverseMode]);

  // Turn warnings at 100 m and 30 m
  useEffect(() => {
    if (!isNavigating || !nextTurnCue || distanceToNextTurn === null) return;

    // 100m early warning
    if (distanceToNextTurn <= 100 && distanceToNextTurn > 30) {
      if (!warned100mTurnsRef.current.has(nextTurnCue.id)) {
        warned100mTurnsRef.current.add(nextTurnCue.id);

        if (settings.vibrateEnabled) {
          triggerVibration([150, 100, 150]);
        }
        if (settings.beepEnabled) {
          playTurnChime();
        }
      }
    }

    // 30m imminent turn warning
    if (distanceToNextTurn <= 30 && distanceToNextTurn >= 0) {
      if (!warned30mTurnsRef.current.has(nextTurnCue.id)) {
        warned30mTurnsRef.current.add(nextTurnCue.id);

        if (settings.vibrateEnabled) {
          vibrateTurnCue(nextTurnCue.turnType);
        }
        if (settings.beepEnabled) {
          playTurnChime();
        }
      }
    }
  }, [isNavigating, nextTurnCue, distanceToNextTurn, settings.vibrateEnabled, settings.beepEnabled]);

  // Arrival detection within 25 m of the end with finish summary (time, distance, gain)
  useEffect(() => {
    if (!isNavigating || !activeTrail || !projectedPosition) return;

    const distRemaining = effectiveDistanceRemaining;
    const targetEndpoint = isReverseMode
      ? activeTrail.points[0]
      : activeTrail.points[activeTrail.points.length - 1];
    const distToEndPoint = userPosition
      ? haversineDistance(userPosition.lat, userPosition.lon, targetEndpoint.lat, targetEndpoint.lon)
      : Infinity;

    // Being close to the end point in a straight line only counts if the path distance left is also short,
    // so loops and out-and-backs (start == end) don't finish at the trailhead.
    const isNearEnd = distRemaining <= 25 || (distToEndPoint <= 25 && distRemaining <= 100) || (activeTrail.isRoundTrip && distToEndPoint <= 25);

    // Check if user has made progress so loop trails don't immediately trigger on start
    const distTraveled = Math.max(0, Math.abs(projectedPosition.distanceAlongTrail - (navStartDistanceRef.current ?? 0)));
    // Round trips start and end at the same place, so "near the end" also has to mean "came back":
    //  a) on the return leg and within 25 m of the end, or
    //  b) walked at least 120 m, got at least 60 m away from the trailhead, and is back within 25 m of it
    //     (doesn't depend on leg detection, which can be wrong in poor GPS conditions)
    const cameBackToStart =
      activeTrail.isRoundTrip &&
      maxDistFromStartRef.current >= 60 &&
      distanceActuallyWalked >= 120 &&
      haversineDistance(
        userPosition?.lat ?? 0,
        userPosition?.lon ?? 0,
        activeTrail.points[0].lat,
        activeTrail.points[0].lon
      ) <= 25;
    const hasProgressed = activeTrail.isRoundTrip
      ? isReverseMode
        ? distanceActuallyWalked > 100
        : (currentLegRef.current === 'return' &&
            projectedPosition.distanceAlongTrail > activeTrail.totalDistance / 2) ||
          cameBackToStart
      : distTraveled > 25 ||
        projectedPosition.distanceAlongTrail > Math.min(60, activeTrail.totalDistance * 0.4);

    if (isNearEnd && hasProgressed && !hasArrivedRef.current) {
      hasArrivedRef.current = true;
      playArrivalFanfare();
      vibrateArrival();

      // Report the distance actually walked (breadcrumbs), not the position difference along the trail
      const totalHikeDistance =
        distanceActuallyWalked > 0
          ? distanceActuallyWalked
          : distTraveled > 0
          ? distTraveled
          : projectedPosition.distanceAlongTrail;
      const totalGain = activeTrail.elevationGain ?? 0;

      setFinishSummary({
        isOpen: true,
        time: elapsedSeconds,
        distance: totalHikeDistance,
        gain: totalGain,
      });

      // Stop active navigation and simulation
      setIsNavigating(false);
      setIsSimulatingWalk(false);
      navStartTimeRef.current = null;
      clearActiveSessionFromDB().catch(console.warn);
      setResumableSession(null);
    }
  }, [isNavigating, activeTrail, projectedPosition, effectiveDistanceRemaining, userPosition, elapsedSeconds, isReverseMode, distanceActuallyWalked]);

  // Simulation test helper: Jump to next turn (positioned at 110m so both 100m and 30m warnings trigger)
  const handleJumpToNextTurn = useCallback(() => {
    if (!activeTrail || activeTrail.turnCues.length === 0) return;
    const currentDist = simCumDistance;
    const upcoming = activeTrail.turnCues.filter(c => c.distanceAlongTrail > currentDist + 110);
    const targetTurn = upcoming[0] || activeTrail.turnCues[0];

    if (targetTurn) {
      // Place user 110 meters before the turn
      const jumpDist = Math.max(0, targetTurn.distanceAlongTrail - 110);
      setSimCumDistance(jumpDist);
      const pt = getPointAtDistance(activeTrail.points, jumpDist);
      setUserPosition({
        lat: pt.lat,
        lon: pt.lon,
        accuracy: 5,
        speed: 1.4,
        heading: 0,
        timestamp: Date.now(),
      });
      setIsSimulatingWalk(true);
    }
  }, [activeTrail, simCumDistance]);

  // Simulation test helper: Jump to finish (< 25m from end)
  const handleJumpToFinish = useCallback(() => {
    if (!activeTrail || activeTrail.points.length === 0) return;
    const finishDist = Math.max(0, activeTrail.totalDistance - 15);
    setSimCumDistance(finishDist);
    const pt = getPointAtDistance(activeTrail.points, finishDist);
    setUserPosition({
      lat: pt.lat,
      lon: pt.lon,
      accuracy: 5,
      speed: 1.4,
      heading: 0,
      timestamp: Date.now(),
    });
    setIsSimulatingWalk(true);
  }, [activeTrail]);

  // Simulation test helper: Turn around at X%
  const handleSimTurnAroundAt = useCallback((pct: number) => {
    if (!activeTrail || activeTrail.points.length === 0) return;
    const turnDist = (pct / 100) * activeTrail.totalDistance;

    if (activeTrail.isRoundTrip) {
      const midDist = activeTrail.totalDistance / 2;
      if (turnDist <= midDist) {
        // User turned around on the outbound leg at distance d:
        // Match them to the return leg at (total - d)
        const returnLegDist = activeTrail.totalDistance - turnDist;
        setSimCumDistance(returnLegDist);
        setSimWalkingDirection(1); // Return leg walks toward trail end
        lastDistanceAlongRef.current = returnLegDist;
        currentLegRef.current = 'return';
        roundTripStateRef.current = createRoundTripState();
        projectionCacheRef.current = null;
        setTurnAroundNotice("Turned around – heading back to start");

        const pt = getPointAtDistance(activeTrail.points, returnLegDist);
        const lookaheadPt = getPointAtDistance(activeTrail.points, Math.min(activeTrail.totalDistance, returnLegDist + 5));
        const heading = calculateBearing(pt.lat, pt.lon, lookaheadPt.lat, lookaheadPt.lon);

        setUserPosition({
          lat: pt.lat,
          lon: pt.lon,
          accuracy: 5,
          speed: (simSpeedKmh * 1000) / 3600,
          heading,
          timestamp: Date.now(),
        });
        setIsSimulatingWalk(true);
        return;
      } else {
        // Already on return leg
        setSimCumDistance(turnDist);
        setSimWalkingDirection(1);
        lastDistanceAlongRef.current = turnDist;
        currentLegRef.current = 'return';
      }
    } else {
      // Non-round trip trail:
      // Turn around -> Walk BACK toward start (decreasing cum distance) in reverse mode
      setSimCumDistance(turnDist);
      setSimWalkingDirection(-1);
      lastDistanceAlongRef.current = turnDist;
      setIsReverseMode(true);
      setTurnAroundNotice("Turned around – heading back to start");

      const pt = getPointAtDistance(activeTrail.points, turnDist);
      const lookaheadPt = getPointAtDistance(activeTrail.points, Math.max(0, turnDist - 5));
      const heading = calculateBearing(pt.lat, pt.lon, lookaheadPt.lat, lookaheadPt.lon);

      setUserPosition({
        lat: pt.lat,
        lon: pt.lon,
        accuracy: 5,
        speed: (simSpeedKmh * 1000) / 3600,
        heading,
        timestamp: Date.now(),
      });
      setIsSimulatingWalk(true);
      return;
    }
  }, [activeTrail, simSpeedKmh]);

  const isDayMode = settings.highContrastMode === 'sunlight-bright';

  const renderErrorToast = () => {
    if (!errorToast) return null;
    return (
      <div
        id="app-error-toast"
        role="alert"
        className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] max-w-md w-[calc(100%-2rem)] p-3.5 rounded-[var(--radius-sm)] bg-[var(--danger)] text-white shadow-2xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-3"
      >
        <div className="flex items-center gap-2.5 font-bold text-xs sm:text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0 text-white" />
          <span>{errorToast}</span>
        </div>
        <button
          id="close-error-toast-btn"
          onClick={() => setErrorToast(null)}
          className="p-1 rounded-lg hover:bg-white/20 transition shrink-0"
          aria-label="Dismiss error"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  };

  // Screen 1: Trail List
  if (currentScreen === 'list' || !activeTrail) {
    return (
      <>
        {renderErrorToast()}
        <TrailListScreen
          savedTrails={savedTrails}
          onSelectTrail={handleSelectTrail}
          onSaveTrail={handleSaveTrail}
          onDeleteTrail={handleDeleteTrail}
          onReverseTrail={handleReverseTrail}
          highContrastMode={settings.highContrastMode}
          onToggleTheme={handleToggleTheme}
          units={settings.units}
          onChangeUnits={handleChangeUnits}
          resumableSession={
            resumableSession
              ? {
                  trail: resumableSession.trail,
                  elapsedSeconds: resumableSession.session.elapsedSeconds,
                  lastDistanceAlong: resumableSession.session.lastDistanceAlong,
                }
              : null
          }
          onResumeHike={handleResumeHike}
          onDiscardSession={handleDiscardSession}
        />
      </>
    );
  }

  // Screen 2: Navigation Screen
  // "arrow on top, stats in the middle, and the map below"
  return (
    <div
      id="trail-navigation-screen"
      className="h-screen w-screen flex flex-col overflow-hidden select-none bg-[var(--bg)] text-[var(--text)] font-[family-name:var(--font-body)]"
    >
      {renderErrorToast()}
      {/* Top Header Bar */}
      <header
        className="px-3 py-2 shrink-0 flex items-center justify-between gap-2 bg-[var(--surface)]"
        style={{ borderBottom: 'var(--border-w-strong) solid var(--border-color)' }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            id="back-to-trails-btn"
            onClick={() => {
              setIsNavigating(false);
              setIsSimulatingWalk(false);
              setCurrentScreen('list');
            }}
            className="p-2 rounded-[var(--radius-sm)] flex items-center gap-1 font-bold text-xs uppercase tracking-wider transition active:scale-95 bg-[var(--surface-2)] hover:opacity-80 text-[var(--text)]"
            aria-label="Back to saved trails"
          >
            <ChevronLeft className="w-4 h-4 -ml-1" />
            <span>Trails</span>
          </button>

          <h1 className="text-sm sm:text-base font-bold tracking-tight truncate max-w-[150px] sm:max-w-xs font-[family-name:var(--font-display)]">
            {activeTrail.name}
          </h1>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Toggle Stats Panel Button */}
          <button
            id="toggle-stats-panel-btn"
            onClick={() => setIsStatsVisible(prev => !prev)}
            className={`px-2.5 py-1.5 rounded-[var(--radius-sm)] border text-xs font-extrabold uppercase flex items-center gap-1 transition active:scale-95 ${
              isStatsVisible
                ? 'bg-[var(--accent)] text-white border-[var(--accent)] shadow-sm'
                : 'bg-[var(--surface)] border-[var(--border-color)] text-[var(--text)] hover:opacity-80 transition-opacity'
            }`}
            title={isStatsVisible ? 'Hide time and stats' : 'Show time and trip stats'}
            aria-label="Toggle stats and time"
          >
            <Activity className="w-3.5 h-3.5" />
            <span className="text-xs">
              {formatTotalTime(elapsedSeconds)}
            </span>
          </button>

          {/* Toggle Compass/Turn Panel Button */}
          <button
            id="toggle-compass-panel-btn"
            onClick={() => setIsCompassVisible(prev => !prev)}
            className={`p-2 rounded-[var(--radius-sm)] border transition active:scale-95 ${
              isCompassVisible
                ? 'bg-[var(--accent-2)] text-white border-[var(--accent-2)] shadow-sm'
                : 'bg-[var(--surface)] border-[var(--border-color)] text-[var(--text)] hover:opacity-80 transition-opacity'
            }`}
            title={isCompassVisible ? 'Hide compass guidance' : 'Show compass guidance'}
            aria-label="Toggle compass guidance"
          >
            <Compass className="w-4 h-4" />
          </button>

          {/* Manual Reverse Mode Toggle: "Head back to start" / "Continue to end" */}
          <button
            id="toggle-reverse-mode-btn"
            onClick={() => {
              if (isReverseMode) {
                setIsReverseMode(false);
                setTurnAroundNotice(null);
                setSimWalkingDirection(1);
              } else {
                setIsReverseMode(true);
                setTurnAroundNotice("Turned around – heading back to start");
                setSimWalkingDirection(-1);
              }
            }}
            className={`px-2.5 py-1.5 rounded-[var(--radius-sm)] border text-xs font-extrabold uppercase flex items-center gap-1 transition active:scale-95 ${
              isReverseMode
                ? 'bg-[var(--info)] text-white border-[var(--info)] shadow-sm'
                : 'bg-[var(--surface)] border-[var(--border-color)] text-[var(--text)] hover:opacity-80 transition-opacity'
            }`}
            title={isReverseMode ? 'Continue to end of trail' : 'Head back to start of trail'}
            aria-label={isReverseMode ? 'Continue to end' : 'Head back to start'}
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {isReverseMode ? 'Continue to end' : 'Head back to start'}
            </span>
          </button>

          {/* Desk Test Mode Toggle */}
          <button
            id="toggle-simulation-mode-btn"
            onClick={() => {
              unlockAudio();
              setIsSimulationMode(prev => !prev);
              if (!isSimulationMode) {
                setIsSimulatingWalk(true);
                // Off-trail/turn-cue sound, vibration and warnings only run while
                // isNavigating is true, so turning on Test mode must start "navigating"
                // too - otherwise the desk-test buttons silently do nothing.
                if (!isNavigating) {
                  handleToggleNavigation();
                }
              }
            }}
            className={`px-2.5 py-1.5 rounded-[var(--radius-sm)] border text-xs font-extrabold uppercase flex items-center gap-1 transition active:scale-95 ${
              isSimulationMode
                ? 'bg-[var(--danger)] text-white border-[var(--danger)]'
                : 'bg-[var(--surface)] border-[var(--border-color)] text-[var(--text)] hover:opacity-80 transition-opacity'
            }`}
            title="Desk test simulation"
          >
            <FlaskConical className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Test</span>
          </button>

          {/* Theme Toggle */}
          <button
            id="nav-theme-toggle-btn"
            onClick={handleToggleTheme}
            className="p-2 rounded-[var(--radius-sm)] border transition active:scale-95 bg-[var(--surface)] border-[var(--border-color)] text-[var(--text)] hover:opacity-80"
            aria-label="Toggle contrast theme"
          >
            {isDayMode ? <Moon className="w-4 h-4 text-[var(--accent-2)]" /> : <Sun className="w-4 h-4 text-[var(--accent)]" />}
          </button>

          {/* Settings Modal Toggle */}
          <button
            id="open-settings-btn"
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-[var(--radius-sm)] border transition active:scale-95 bg-[var(--surface)] border-[var(--border-color)] text-[var(--text)] hover:opacity-80"
            aria-label="Settings"
          >
            <SettingsIcon className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* GPS Status Banner with actionable instructions */}
      {!isSimulationMode && gpsState !== 'ok' && (
        <div
          id="gps-status-banner"
          role="alert"
          className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md z-[460] shrink-0 bg-[var(--surface)] text-[var(--text)]"
          style={{
            borderBottom: `var(--border-w-strong) solid ${
              gpsState === 'denied'
                ? 'var(--danger)'
                : gpsState === 'unavailable' || gpsState === 'timeout'
                ? 'var(--accent)'
                : 'var(--info)'
            }`,
          }}
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              {gpsState === 'acquiring' && (
                <div className="relative flex items-center justify-center w-5 h-5">
                  <span className="animate-ping absolute inline-flex h-4 w-4 rounded-full bg-[var(--info)] opacity-75"></span>
                  <Radio className="w-5 h-5 text-[var(--info)] relative" />
                </div>
              )}
              {gpsState === 'denied' && (
                <AlertTriangle className="w-5 h-5 text-[var(--danger)]" />
              )}
              {gpsState === 'unavailable' && (
                <AlertCircle className="w-5 h-5 text-[var(--accent)]" />
              )}
              {gpsState === 'timeout' && (
                <Clock className="w-5 h-5 text-[var(--accent)]" />
              )}
            </div>

            <div className="text-xs space-y-0.5">
              <div className="font-extrabold uppercase tracking-wider text-[11px]">
                {gpsState === 'acquiring' && 'Acquiring GPS Fix...'}
                {gpsState === 'denied' && 'Location Permission Denied'}
                {gpsState === 'unavailable' && 'GPS Hardware / Signal Unavailable'}
                {gpsState === 'timeout' && 'GPS Acquisition Timed Out'}
              </div>
              <div className="opacity-90 leading-relaxed font-medium">
                {gpsState === 'acquiring' &&
                  'Searching for satellites. For fast acquisition, ensure you are outdoors with an unobstructed view of the sky.'}
                {gpsState === 'denied' &&
                  'Browser denied location access. What to do: Tap the padlock/tune icon in your browser address bar, enable Location permissions, and reload the page.'}
                {gpsState === 'unavailable' &&
                  'Cannot connect to GPS hardware. What to do: Verify device Location Services (GPS) are toggled ON in system settings, move to an open area, and tap Retry.'}
                {gpsState === 'timeout' &&
                  'Search timed out before acquiring satellites. What to do: Ensure you are outdoors away from dense cover or tall buildings, then tap Retry GPS.'}
              </div>
            </div>
          </div>

          {(gpsState === 'unavailable' || gpsState === 'timeout' || gpsState === 'denied') && (
            <button
              id="gps-retry-button"
              onClick={() => {
                setGpsState('acquiring');
                setGpsRetryTrigger(prev => prev + 1);
              }}
              className="self-start sm:self-auto px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-extrabold uppercase tracking-wider transition active:scale-95 flex items-center gap-1.5 shrink-0 shadow-sm text-white hover:opacity-90"
              style={{ background: gpsState === 'denied' ? 'var(--danger)' : 'var(--accent)' }}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry GPS</span>
            </button>
          )}
        </div>
      )}

      {/* Main Map Arena (Occupies full space by default, with slide-in HUD overlays) */}
      <div className="flex-1 relative w-full overflow-hidden">
        {/* Turn Around Notice: "Turned around – heading back to start" */}
        <AnimatePresence>
          {turnAroundNotice && (
            <motion.div
              initial={{ y: -40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -40, opacity: 0 }}
              className="absolute top-16 left-1/2 -translate-x-1/2 z-[460] px-4 py-2.5 rounded-[var(--radius-md)] bg-[var(--info)] text-white font-extrabold text-xs sm:text-sm shadow-2xl flex items-center gap-2.5 max-w-[90vw]"
              style={{ border: 'var(--border-w) solid var(--border-color)' }}
            >
              <RotateCcw className="w-4 h-4 shrink-0" />
              <span>{turnAroundNotice}</span>
              <button
                onClick={() => setTurnAroundNotice(null)}
                className="ml-2 p-1 hover:bg-black/10 rounded-lg transition"
                aria-label="Dismiss notice"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Full-bleed Trail Map */}
        <TrailMap
          trail={activeTrail}
          userPosition={userPosition}
          projectedPosition={projectedPosition}
          targetPoint={navigationTarget?.targetPoint ?? null}
          turnCues={mapTurnCues}
          followMe={followMe}
          onToggleFollowMe={() => setFollowMe(prev => !prev)}
          onDisableFollowMe={() => setFollowMe(false)}
          heading={heading}
          highContrastMode={settings.highContrastMode}
          breadcrumbs={breadcrumbSegments}
          units={settings.units}
          isReverseMode={isReverseMode}
        />

        {/* 1. Slidable Compass & Guidance Header (Slides down from top when focused) */}
        <AnimatePresence>
          {isCompassVisible && (
            <motion.div
              initial={{ y: -80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -80, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="absolute top-0 left-0 right-0 z-[450] shadow-2xl pointer-events-auto"
            >
              <CompassHeader
                arrowAngle={arrowAngle}
                directionHeadline={directionText.headline}
                directionSubline={directionText.subline}
                distanceToTarget={distanceToTarget}
                nextTurnCue={nextTurnCue}
                distanceToNextTurn={distanceToNextTurn}
                isOffTrail={isOffTrail}
                offTrailDistance={projectedPosition?.distanceFromTrail ?? 0}
                headingSource={headingSource}
                needsSensorPermission={needsSensorPermission}
                onRequestPermission={requestCompassPermission}
                highContrastMode={settings.highContrastMode}
                onClose={() => setIsCompassVisible(false)}
                units={settings.units}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* 2. Slidable Stats & Time Panel (Slides down below compass or up from bottom when focused) */}
        <AnimatePresence>
          {isStatsVisible && (
            <motion.div
              initial={{ y: -50, opacity: 0 }}
              animate={{ y: isCompassVisible ? 120 : 0, opacity: 1 }}
              exit={{ y: -50, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="absolute top-0 left-0 right-0 z-[440] shadow-2xl pointer-events-auto"
            >
              <StatsBar
                totalElapsedSeconds={elapsedSeconds}
                paceSecondsPerKm={smoothedPaceSecPerKm}
                estimatedTimeRemainingSeconds={estimatedTimeRemainingSec}
                distanceRemaining={effectiveDistanceRemaining}
                distanceSoFar={projectedPosition?.distanceAlongTrail ?? 0}
                distanceFromTrail={projectedPosition?.distanceFromTrail ?? 0}
                offTrailThreshold={settings.offTrailThreshold}
                highContrastMode={settings.highContrastMode}
                isReverseMode={isReverseMode}
                distanceWalked={distanceActuallyWalked}
                units={settings.units}
                onClose={() => setIsStatsVisible(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating Minimal HUD Pill (when panels are off-screen) for one-tap glance and toggle */}
        {!isStatsVisible && !isCompassVisible && (
          <div className="absolute top-3 left-3 z-[400] flex items-center gap-1.5 pointer-events-auto">
            <button
              id="quick-slide-stats-pill"
              onClick={() => setIsStatsVisible(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-sm)] text-xs font-extrabold tracking-tight shadow-lg border backdrop-blur-md transition active:scale-95 bg-[var(--surface)]/95 text-[var(--text)] border-[var(--border-color)] hover:opacity-90"
              title="Tap to slide stats and time into focus"
            >
              <div className="flex items-center gap-1 text-[var(--info)] font-mono">
                <span className="text-[10px] text-[var(--text-secondary)] font-sans font-bold">TIME</span>
                <span>{formatTotalTime(elapsedSeconds)}</span>
              </div>
              <span className="text-[var(--border-color)]">|</span>
              <div className="flex items-center gap-1 text-[var(--accent-2)] font-mono">
                <span className="text-[10px] text-[var(--text-secondary)] font-sans font-bold">
                  {isReverseMode ? 'TO START' : 'LEFT'}
                </span>
                <span>{formatTimeRemaining(estimatedTimeRemainingSec, effectiveDistanceRemaining)}</span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-[var(--text-secondary)] ml-0.5" />
            </button>
          </div>
        )}

        {/* Floating Simulation Controls Drawer (when test mode active) */}
        {isSimulationMode && (
          <div className="absolute top-2 left-2 right-14 z-[400] max-w-sm pointer-events-auto">
            <SimulationControls
              isSimulating={isSimulatingWalk}
              onToggleSimulation={() => {
                unlockAudio();
                setIsSimulatingWalk(prev => !prev);
              }}
              speedKmh={simSpeedKmh}
              onChangeSpeed={setSimSpeedKmh}
              onDriftOffTrail={() => {
                unlockAudio();
                setIsDriftingOffTrail(true);
              }}
              onReturnToTrail={() => setIsDriftingOffTrail(false)}
              onJumpToNextTurn={() => {
                unlockAudio();
                handleJumpToNextTurn();
              }}
              onJumpToEnd={handleJumpToFinish}
              onTurnAroundAt={handleSimTurnAroundAt}
              isReverseMode={isReverseMode}
              onClose={() => setIsSimulationMode(false)}
              isDriftingOffTrail={isDriftingOffTrail}
              highContrastMode={settings.highContrastMode}
              units={settings.units}
            />
          </div>
        )}
      </div>

      {/* Big Start / Stop Navigation Button (Bottom) */}
      <div
        id="bottom-action-dock"
        className="p-3 shrink-0 bg-[var(--surface)]"
        style={{ borderTop: 'var(--border-w-strong) solid var(--border-color)' }}
      >
        <div className="max-w-xl mx-auto flex items-center gap-2">
          <button
            id="start-stop-navigation-btn"
            onClick={handleToggleNavigation}
            className="flex-1 h-14 rounded-[var(--radius-md)] font-extrabold text-base uppercase tracking-wider flex items-center justify-center gap-2 shadow-2xl transition active:scale-[0.98] text-white hover:opacity-90"
            style={{ background: isNavigating ? 'var(--danger)' : 'var(--accent-2)' }}
          >
            {isNavigating ? (
              <>
                <Square className="w-5 h-5 fill-current" />
                Stop Navigation
              </>
            ) : (
              <>
                <Play className="w-5 h-5 fill-current" />
                Start Navigation
              </>
            )}
          </button>

          {/* Quick Audio Mute button during active nav */}
          <button
            id="quick-mute-toggle-btn"
            onClick={() => setSettings(s => ({ ...s, beepEnabled: !s.beepEnabled }))}
            className={`h-14 w-14 rounded-[var(--radius-md)] border flex items-center justify-center transition active:scale-95 bg-[var(--surface-2)] border-[var(--border-color)] ${
              settings.beepEnabled ? 'text-[var(--accent-2)]' : 'text-[var(--text-secondary)]'
            }`}
            title={settings.beepEnabled ? 'Mute audio beeps' : 'Enable audio beeps'}
            aria-label="Toggle audio alerts"
          >
            {settings.beepEnabled ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
          </button>
        </div>

        {/* Wake lock indicator */}
        {isNavigating && (
          <div className="mt-1 text-center text-[10px] font-bold text-[var(--text-secondary)]">
            {isScreenLocked ? '⚡ Screen Wake Lock Active' : 'Navigating'}
          </div>
        )}
      </div>

      {/* Full-Screen Off-Trail Warning Alert (when triggered) */}
      <OffTrailAlert
        isOpen={isOffTrailAlertActive}
        distanceOffTrail={projectedPosition?.distanceFromTrail ?? 0}
        bearingToTrail={
          userPosition && projectedPosition
            ? calculateBearing(
                userPosition.lat,
                userPosition.lon,
                projectedPosition.point.lat,
                projectedPosition.point.lon
              )
            : 0
        }
        heading={heading}
        onDismiss={() => {
          setIsOffTrailAlertActive(false);
          alertDismissedAtRef.current = Date.now();
          hasBeenWithinClearThresholdSinceDismissRef.current = false;
        }}
        isAudioMuted={isAlertAudioMuted}
        onToggleMute={() => setIsAlertAudioMuted(prev => !prev)}
        units={settings.units}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={setSettings}
      />

      {/* Finish Summary Modal (Arrival within 25m of trail end) */}
      {finishSummary && activeTrail && (
        <FinishSummaryModal
          isOpen={finishSummary.isOpen}
          trailName={activeTrail.name}
          totalElapsedSeconds={finishSummary.time}
          totalDistanceMeters={finishSummary.distance}
          elevationGainMeters={finishSummary.gain}
          highContrastMode={settings.highContrastMode}
          breadcrumbs={breadcrumbSegments}
          units={settings.units}
          onClose={() => setFinishSummary(null)}
          onBackToTrails={() => {
            setFinishSummary(null);
            setBreadcrumbSegments([]);
            breadcrumbSegmentsRef.current = [];
            setCurrentScreen('list');
          }}
          onReverseTrail={() => {
            setFinishSummary(null);
            handleReverseTrail();
            handleToggleNavigation();
          }}
        />
      )}
    </div>
  );
}
