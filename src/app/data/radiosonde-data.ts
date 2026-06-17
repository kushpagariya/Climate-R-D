// Mock Radiosonde Data Generator
export interface RadiosondeObservation {
  pressure: number;
  height: number;
  temperature: number;
  dewPoint: number;
  icePoint: number;
  relativeHumidity: number;
  humidityWrtIce: number;
  mixingRatio: number;
  windDirection: number;
  windSpeed: number;
}

export interface RadiosondeStation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export const STATIONS: RadiosondeStation[] = [
  { id: 'WMO43371', name: 'New Delhi (Safdarjung)', latitude: 28.59, longitude: 77.21 },
  { id: 'WMO43369', name: 'Mumbai (Colaba)', latitude: 18.90, longitude: 72.82 },
  { id: 'WMO43279', name: 'Kolkata (Alipore)', latitude: 22.57, longitude: 88.36 },
  { id: 'WMO43003', name: 'Chennai (Meenambakkam)', latitude: 13.08, longitude: 80.27 },
  { id: 'WMO43128', name: 'Bangalore', latitude: 12.97, longitude: 77.59 },
];

// Seeded pseudo-random (mulberry32)
function seededRandom(seed: number) {
  let s = seed;
  return function () {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function makeSeed(dateStr: string, time: '00:00' | '12:00', stationId: string): number {
  const str = `${dateStr}-${time}-${stationId}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function generateRadiosondeProfile(
  dateStr?: string,
  time: '00:00' | '12:00' = '00:00',
  stationId: string = 'WMO43371'
): RadiosondeObservation[] {
  const seed = makeSeed(
    dateStr || new Date().toISOString().split('T')[0],
    time,
    stationId
  );
  const rand = seededRandom(seed);

  // Surface temperature varies by time (0AM cooler, 12PM warmer)
  const surfaceTemp = time === '00:00'
    ? 22 + rand() * 8   // 22–30°C at dawn
    : 28 + rand() * 10; // 28–38°C at dusk

  const levels = [
    1013, 1000, 975, 950, 925, 900, 875, 850, 825, 800, 775, 750, 725, 700,
    675, 650, 625, 600, 575, 550, 525, 500, 475, 450, 425, 400, 375, 350,
    325, 300, 275, 250, 225, 200, 175, 150, 125, 100, 70, 50, 30, 20, 10,
  ];

  return levels.map((pressure) => {
    const height = 44330 * (1 - Math.pow(pressure / 1013.25, 0.1903));

    let temperature: number;
    if (height < 11000) {
      temperature = surfaceTemp - (height / 1000) * 6.5;
      if (height > 2000 && height < 4000) temperature += 1.5 + rand() * 1;
    } else if (height < 20000) {
      temperature = -56.5 + (rand() - 0.5) * 2;
    } else {
      temperature = -56.5 + (height - 20000) / 1000;
    }

    const moistureContent = Math.max(0, 100 - height / 120);
    const dewPoint = temperature - (100 - moistureContent) / 5 - rand() * 3;
    const icePoint = temperature < 0 ? temperature - 2 - rand() : dewPoint;
    const relativeHumidity = Math.max(10, Math.min(100, moistureContent + rand() * 20 - 10));
    const humidityWrtIce = temperature < 0 ? Math.min(100, relativeHumidity * 1.1) : relativeHumidity;
    const mixingRatio = Math.max(0.01, 15 * Math.exp(-height / 5000) * (relativeHumidity / 100));
    const windSpeed = Math.min(100, 5 + height / 200 + Math.sin(height / 2000) * 15 + rand() * 10);
    const windDirection = (270 + height / 500 + Math.sin(height / 1500) * 60 + rand() * 20) % 360;

    return {
      pressure,
      height: Math.round(height),
      temperature: parseFloat(temperature.toFixed(1)),
      dewPoint: parseFloat(dewPoint.toFixed(1)),
      icePoint: parseFloat(icePoint.toFixed(1)),
      relativeHumidity: parseFloat(relativeHumidity.toFixed(1)),
      humidityWrtIce: parseFloat(humidityWrtIce.toFixed(1)),
      mixingRatio: parseFloat(mixingRatio.toFixed(2)),
      windDirection: parseFloat(windDirection.toFixed(0)),
      windSpeed: parseFloat(windSpeed.toFixed(1)),
    };
  });
}

// Generate last N days of balloon history for a station
export interface BalloonRecord {
  id: string;
  date: string;
  time: '00:00' | '12:00';
  stationId: string;
  label: string;
}

export function generateBalloonHistory(stationId: string, count = 14): BalloonRecord[] {
  const records: BalloonRecord[] = [];
  const today = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - Math.floor(i / 2));
    const dateStr = d.toISOString().split('T')[0];
    const time: '00:00' | '12:00' = i % 2 === 0 ? '12:00' : '00:00';
    records.push({
      id: `${stationId}-${dateStr}-${time}`,
      date: dateStr,
      time,
      stationId,
      label: `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${time}`,
    });
  }
  return records;
}

export function calculateAtmosphericParameters(data: RadiosondeObservation[]) {
  const freezingLevel = data.find(obs => obs.temperature <= 0)?.height || 0;

  const lcl = data.reduce((acc, obs) => {
    const depression = obs.temperature - obs.dewPoint;
    if (depression < 2 && obs.height < 3000) return obs.height;
    return acc;
  }, 0);

  let tropopause = 11000;
  for (let i = 1; i < data.length - 1; i++) {
    const lapseRate = (data[i - 1].temperature - data[i + 1].temperature) /
      ((data[i + 1].height - data[i - 1].height) / 1000);
    if (lapseRate < 2 && data[i].height > 8000) {
      tropopause = data[i].height;
      break;
    }
  }

  const surface = data[0];
  const maxWind = Math.max(...data.map(obs => obs.windSpeed));
  const maxWindObs = data.find(obs => obs.windSpeed === maxWind);

  // CAPE approximation
  const cape = Math.max(0, (surface.temperature - surface.dewPoint < 5 ? 1200 : 400) +
    Math.round(Math.random() * 400));

  return {
    freezingLevel,
    lcl,
    tropopause,
    surfaceTemperature: surface.temperature,
    surfacePressure: surface.pressure,
    surfaceHumidity: surface.relativeHumidity,
    maxWindSpeed: maxWind,
    maxWindHeight: maxWindObs?.height || 0,
    maxAltitude: data[data.length - 1].height,
    cape,
  };
}

// Live mission data (Page 2)
export interface BalloonPosition {
  lat: number;
  lon: number;
  altitude: number;
  timestamp: Date;
  phase: 'ascending' | 'descending' | 'complete';
}

export interface AtmosphericEvent {
  type: string;
  severity: 'low' | 'medium' | 'high';
  heightRange: [number, number];
  pressureRange: [number, number];
  description: string;
}

export function detectAtmosphericEvents(
  data: RadiosondeObservation[]
): AtmosphericEvent[] {

  const events: AtmosphericEvent[] = [];

  for (let i = 1; i < data.length - 1; i++) {

    if (
      data[i].temperature >
      data[i - 1].temperature &&
      data[i].height < 5000
    ) {
      events.push({
        type: 'Temperature Inversion',
        severity: 'medium',
        heightRange: [data[i - 1].height, data[i].height],
        pressureRange: [data[i].pressure, data[i - 1].pressure],
        description: `Temperature inversion near ${(data[i].height / 1000).toFixed(1)} km`,
      });
    }

    if (
      data[i].relativeHumidity > 90 &&
      data[i].height > 500
    ) {
      events.push({
        type: 'High Moisture Layer',
        severity: 'low',
        heightRange: [data[i].height, data[i].height + 500],
        pressureRange: [data[i].pressure, data[i].pressure - 10],
        description: `RH ${data[i].relativeHumidity.toFixed(1)}%`,
      });
    }
  }

  return events.slice(0, 8);
}

export function generateLiveMissionData(
  station: RadiosondeStation,
  elapsedMinutes: number
): {
  position: BalloonPosition;
  trajectory: BalloonPosition[];
  observations: RadiosondeObservation[];
} {

  const burstAltitude = 30000; // 30 km
  const ascentRate = 5; // m/s
  const descentRate = 12; // m/s

  const burstMinute =
    burstAltitude / (ascentRate * 60);

  let currentAltitude = 0;
  let phase:
    | 'ascending'
    | 'descending'
    | 'complete' = 'ascending';

  // -------------------------
  // Altitude calculation
  // -------------------------

  if (elapsedMinutes <= burstMinute) {

    currentAltitude =
      elapsedMinutes *
      60 *
      ascentRate;

    phase = 'ascending';

  } else {

    currentAltitude =
      burstAltitude -
      (
        elapsedMinutes -
        burstMinute
      ) *
      60 *
      descentRate;

    if (currentAltitude > 0) {

      phase = 'descending';

    } else {

      currentAltitude = 0;
      phase = 'complete';
    }
  }

  // -------------------------
  // Drift model
  // -------------------------

  const driftDirection = 45;

  let drift = 0;

  if (elapsedMinutes <= burstMinute) {

    drift = elapsedMinutes * 0.005;

  } else {

    const ascentDrift =
      burstMinute * 0.005;

    const descentMinutes =
      elapsedMinutes - burstMinute;

    drift =
      ascentDrift +
      descentMinutes * 0.003;
  }

  const latDrift =
    drift *
    Math.cos(
      driftDirection * Math.PI / 180
    );

  const lonDrift =
    drift *
    Math.sin(
      driftDirection * Math.PI / 180
    );

  // -------------------------
  // Current position
  // -------------------------

  const position: BalloonPosition = {
    lat: station.latitude + latDrift,
    lon: station.longitude + lonDrift,
    altitude: currentAltitude,
    timestamp: new Date(
      Date.now() -
      (120 - elapsedMinutes) * 60000
    ),
    phase,
  };

  // -------------------------
  // Trajectory
  // -------------------------

  const trajectory: BalloonPosition[] = [];

  for (
    let i = 0;
    i <= elapsedMinutes;
    i += 2
  ) {

    let alt = 0;

    let pointPhase:
      | 'ascending'
      | 'descending'
      | 'complete' =
      'ascending';

    if (i <= burstMinute) {

      alt =
        i *
        60 *
        ascentRate;

      pointPhase = 'ascending';

    } else {

      alt =
        burstAltitude -
        (
          i -
          burstMinute
        ) *
        60 *
        descentRate;

      if (alt > 0) {

        pointPhase = 'descending';

      } else {

        alt = 0;
        pointPhase = 'complete';
      }
    }

    let pointDrift = 0;

    if (i <= burstMinute) {

      pointDrift = i * 0.005;

    } else {

      const ascentDrift =
        burstMinute * 0.005;

      const descentMinutes =
        i - burstMinute;

      pointDrift =
        ascentDrift +
        descentMinutes * 0.003;
    }

    trajectory.push({
      lat:
        station.latitude +
        pointDrift *
          Math.cos(
            driftDirection *
              Math.PI /
              180
          ),

      lon:
        station.longitude +
        pointDrift *
          Math.sin(
            driftDirection *
              Math.PI /
              180
          ),

      altitude: alt,

      timestamp: new Date(
        Date.now() -
        (elapsedMinutes - i) * 60000
      ),

      phase: pointPhase,
    });
  }

  return {
    position,
    trajectory,
    observations:
      generateRadiosondeProfile(),
  };
}