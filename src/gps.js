const EARTH_RADIUS_M = 6371000;
const MAX_ACCURACY_M = 75;
const MAX_SEGMENT_SPEED_MPS = 8.5;

function toRadians(value) {
  return value * Math.PI / 180;
}

export function distanceMeters(a, b) {
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function createGpsTracker({ geolocation = navigator.geolocation } = {}) {
  let watchId = null;
  let lastPoint = null;
  let totalMeters = 0;
  let acceptedSamples = 0;
  let rejectedSamples = 0;
  let accuracyTotal = 0;
  let lastError = '';
  let watchStarted = false;

  const secureContext = globalThis.isSecureContext === true;
  const geolocationAvailable = typeof geolocation?.watchPosition === 'function';

  function rejectSample(reason) {
    rejectedSamples += 1;
    lastError = reason;
  }

  function acceptPosition(position) {
    const point = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: Number(position.coords.accuracy),
      timestamp: Number(position.timestamp || Date.now())
    };

    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) {
      rejectSample('GPS sample rejected: invalid coordinates.');
      return;
    }
    if (!Number.isFinite(point.accuracy) || point.accuracy > MAX_ACCURACY_M) {
      rejectSample(`GPS sample rejected: accuracy ${Number.isFinite(point.accuracy) ? Math.round(point.accuracy) : 'unknown'}m.`);
      return;
    }

    if (lastPoint) {
      const elapsedSeconds = Math.max(1, (point.timestamp - lastPoint.timestamp) / 1000);
      const segmentMeters = distanceMeters(lastPoint, point);
      const speed = segmentMeters / elapsedSeconds;
      if (Number.isFinite(segmentMeters) && speed <= MAX_SEGMENT_SPEED_MPS) {
        totalMeters += segmentMeters;
      } else {
        rejectSample(`GPS sample rejected: segment speed ${Number.isFinite(speed) ? speed.toFixed(1) : 'unknown'} m/s.`);
        return;
      }
    }

    lastPoint = point;
    acceptedSamples += 1;
    accuracyTotal += point.accuracy;
  }

  function status() {
    const distanceMetersValue = Math.round(totalMeters);
    return {
      secure_context: secureContext,
      geolocation_available: geolocationAvailable,
      watch_started: watchStarted,
      waiting_for_first_sample: watchStarted && acceptedSamples === 0 && !lastError,
      distance_meters: distanceMetersValue,
      distance_km: Number((distanceMetersValue / 1000).toFixed(3)),
      gps_sample_count: acceptedSamples,
      gps_rejected_sample_count: rejectedSamples,
      gps_last_error: lastError
    };
  }

  return {
    start() {
      if (!geolocationAvailable || watchId !== null) return false;
      try {
        watchId = geolocation.watchPosition(
          acceptPosition,
          (error) => { lastError = error?.message || 'Location unavailable.'; },
          { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
        );
        watchStarted = true;
      } catch (error) {
        lastError = error?.message || 'Location unavailable.';
        watchStarted = false;
        return false;
      }
      return true;
    },
    stop() {
      if (watchId !== null && geolocation?.clearWatch) geolocation.clearWatch(watchId);
      watchId = null;
      watchStarted = false;
      lastPoint = null;
    },
    status,
    summary() {
      const currentStatus = status();
      return {
        distance_meters: currentStatus.distance_meters,
        distance_km: currentStatus.distance_km,
        gps_used: true,
        gps_points_discarded: true,
        gps_accuracy_summary: acceptedSamples > 0
          ? `avg ${Math.round(accuracyTotal / acceptedSamples)}m, accepted ${acceptedSamples}, rejected ${rejectedSamples}`
          : `no accepted samples, rejected ${rejectedSamples}`,
        gps_sample_count: acceptedSamples,
        gps_rejected_sample_count: rejectedSamples,
        gps_secure_context: secureContext,
        gps_geolocation_available: geolocationAvailable,
        gps_no_accepted_samples: acceptedSamples === 0,
        verification_method: 'pwa-gps-aggregate-v1',
        gps_last_error: lastError
      };
    }
  };
}
