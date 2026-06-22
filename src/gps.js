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

  function acceptPosition(position) {
    const point = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: Number(position.coords.accuracy),
      timestamp: Number(position.timestamp || Date.now())
    };

    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) {
      rejectedSamples += 1;
      return;
    }
    if (!Number.isFinite(point.accuracy) || point.accuracy > MAX_ACCURACY_M) {
      rejectedSamples += 1;
      return;
    }

    if (lastPoint) {
      const elapsedSeconds = Math.max(1, (point.timestamp - lastPoint.timestamp) / 1000);
      const segmentMeters = distanceMeters(lastPoint, point);
      const speed = segmentMeters / elapsedSeconds;
      if (Number.isFinite(segmentMeters) && speed <= MAX_SEGMENT_SPEED_MPS) {
        totalMeters += segmentMeters;
      } else {
        rejectedSamples += 1;
      }
    }

    lastPoint = point;
    acceptedSamples += 1;
    accuracyTotal += point.accuracy;
  }

  return {
    start() {
      if (!geolocation?.watchPosition || watchId !== null) return false;
      watchId = geolocation.watchPosition(
        acceptPosition,
        (error) => { lastError = error?.message || 'Location unavailable.'; },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
      );
      return true;
    },
    stop() {
      if (watchId !== null && geolocation?.clearWatch) geolocation.clearWatch(watchId);
      watchId = null;
      lastPoint = null;
    },
    summary() {
      const distanceMetersValue = Math.round(totalMeters);
      return {
        distance_meters: distanceMetersValue,
        distance_km: Number((distanceMetersValue / 1000).toFixed(3)),
        gps_used: true,
        gps_points_discarded: true,
        gps_accuracy_summary: acceptedSamples > 0
          ? `avg ${Math.round(accuracyTotal / acceptedSamples)}m, accepted ${acceptedSamples}, rejected ${rejectedSamples}`
          : `no accepted samples, rejected ${rejectedSamples}`,
        gps_sample_count: acceptedSamples,
        gps_rejected_sample_count: rejectedSamples,
        verification_method: 'pwa-gps-aggregate-v1',
        gps_last_error: lastError
      };
    }
  };
}
