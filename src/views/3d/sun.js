const FloorPlan3DSun = {
  seasonDates: {
    "summer-solstice": "2026-12-21",
    equinox: "2026-03-20",
    "winter-solstice": "2026-06-21",
  },
  parseAngle(value) {
    if (typeof value === "number") return value;
    const text = String(value ?? "").trim();
    const components = text.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    if (!components.length) return NaN;
    const magnitude =
      components[0] + (components[1] ?? 0) / 60 + (components[2] ?? 0) / 3600;
    return /[SW]/i.test(text) || text.startsWith("-") ? -magnitude : magnitude;
  },

  position(config, terrainReference) {
    const coordinates = config.coordinates;
    const solar = config.solar ?? {};
    if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
    const latitude = this.parseAngle(coordinates[0]);
    const longitude = this.parseAngle(coordinates[1]);
    const [hours, minutes] = String(solar.time ?? "15:00")
      .split(":")
      .map(Number);
    const season = solar.season ?? "equinox";
    const date = solar.dates?.[season] ?? solar.date ?? this.seasonDates[season] ?? this.seasonDates.equinox;
    const utcOffset = Number(solar.utc_offset ?? -3);
    if (
      ![latitude, longitude, hours, minutes, utcOffset].every(Number.isFinite) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      return null;
    }

    // NOAA's compact solar-position equations, using the configured local time
    // and UTC offset. Azimuth is measured clockwise from true north.
    const localDate = new Date(`${date}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00Z`);
    if (!Number.isFinite(localDate.getTime())) return null;
    const utcDate = new Date(localDate.getTime() - utcOffset * 60 * 60 * 1000);
    const julianDay = utcDate.getTime() / 86400000 + 2440587.5;
    const century = (julianDay - 2451545) / 36525;
    const degrees = Math.PI / 180;
    const meanLongitude =
      (280.46646 + century * (36000.76983 + century * 0.0003032)) % 360;
    const meanAnomaly =
      357.52911 + century * (35999.05029 - 0.0001537 * century);
    const eccentricity =
      0.016708634 - century * (0.000042037 + 0.0000001267 * century);
    const anomalyRadians = meanAnomaly * degrees;
    const equationOfCenter =
      Math.sin(anomalyRadians) *
        (1.914602 - century * (0.004817 + 0.000014 * century)) +
      Math.sin(2 * anomalyRadians) * (0.019993 - 0.000101 * century) +
      Math.sin(3 * anomalyRadians) * 0.000289;
    const trueLongitude = meanLongitude + equationOfCenter;
    const omega = (125.04 - 1934.136 * century) * degrees;
    const apparentLongitude =
      (trueLongitude - 0.00569 - 0.00478 * Math.sin(omega)) * degrees;
    const meanObliquity =
      23 +
      (26 +
        (21.448 -
          century *
            (46.815 + century * (0.00059 - century * 0.001813))) /
          60) /
        60;
    const obliquity = (meanObliquity + 0.00256 * Math.cos(omega)) * degrees;
    const declination = Math.asin(
      Math.sin(obliquity) * Math.sin(apparentLongitude),
    );
    const y = Math.tan(obliquity / 2) ** 2;
    const longitudeRadians = meanLongitude * degrees;
    const equationOfTime =
      4 *
      ((y * Math.sin(2 * longitudeRadians) -
        2 * eccentricity * Math.sin(anomalyRadians) +
        4 * eccentricity * y *
          Math.sin(anomalyRadians) *
          Math.cos(2 * longitudeRadians) -
        0.5 * y ** 2 * Math.sin(4 * longitudeRadians) -
        1.25 * eccentricity ** 2 * Math.sin(2 * anomalyRadians)) /
        degrees);
    const utcMinutes =
      utcDate.getUTCHours() * 60 +
      utcDate.getUTCMinutes() +
      utcDate.getUTCSeconds() / 60;
    const solarMinutes =
      ((utcMinutes + equationOfTime + 4 * longitude + 1440) % 1440);
    let hourAngle = solarMinutes / 4 - 180;
    if (hourAngle < -180) hourAngle += 360;
    const hourAngleRadians = hourAngle * degrees;
    const latitudeRadians = latitude * degrees;
    const elevation = Math.asin(
      Math.sin(latitudeRadians) * Math.sin(declination) +
        Math.cos(latitudeRadians) *
          Math.cos(declination) *
          Math.cos(hourAngleRadians),
    );
    const azimuth =
      ((Math.atan2(
        Math.sin(hourAngleRadians),
        Math.cos(hourAngleRadians) * Math.sin(latitudeRadians) -
          Math.tan(declination) * Math.cos(latitudeRadians),
      ) /
        degrees +
        180 +
        360) %
        360);
    const localXAxisAzimuth =
      Number(terrainReference?.localXAxisAzimuth ?? 90) * degrees;
    const localYAxisAzimuth =
      Number(terrainReference?.localYAxisAzimuth ?? 0) * degrees;
    const azimuthRadians = azimuth * degrees;
    return {
      azimuth,
      elevation: elevation / degrees,
      direction: [
        Math.cos(azimuthRadians - localXAxisAzimuth),
        Math.cos(azimuthRadians - localYAxisAzimuth),
        Math.sin(elevation),
      ],
      season,
      time: solar.time ?? "15:00",
      date,
    };
  },

  addToScene({ THREE, scene, position, bounds }) {
    if (!position) return;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x7d776b, 1.25));
    if (position.elevation <= 0) return;
    const target = new THREE.Object3D();
    target.position.set(
      (bounds.x0 + bounds.x1) / 2,
      (bounds.y0 + bounds.y1) / 2,
      (bounds.z0 + bounds.z1) / 2,
    );
    scene.add(target);
    const distance = Math.max(bounds.x1 - bounds.x0, bounds.y1 - bounds.y0, 12) * 3;
    const sunlight = new THREE.DirectionalLight(0xfff1d2, 2.2);
    sunlight.position.set(
      target.position.x + position.direction[0] * distance,
      target.position.y + position.direction[1] * distance,
      target.position.z + position.direction[2] * distance,
    );
    sunlight.target = target;
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(2048, 2048);
    sunlight.shadow.camera.left = -distance / 2;
    sunlight.shadow.camera.right = distance / 2;
    sunlight.shadow.camera.top = distance / 2;
    sunlight.shadow.camera.bottom = -distance / 2;
    sunlight.shadow.camera.updateProjectionMatrix();
    sunlight.shadow.bias = -0.0002;
    scene.add(sunlight);
  },
};

window.FloorPlan3DSun = FloorPlan3DSun;
