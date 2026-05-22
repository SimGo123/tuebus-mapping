const NEXT_DAY_BORDER_HR = 4; // 4am is the border for night buses, they belong to the previous day until then

function timeToSeconds(t) {
    const [h, m, s] = t.split(":").map(Number);
    return h * 3600 + m * 60 + s;
}

function getCurrentTimeInSeconds() {
    const now = new Date();
    // now.setHours(0, 30); // Set to 0:30 for night bus testing
    let hrNow = now.getHours();
    // Overflow handling for night buses, they belong to the previous day until NEXT_DAY_BORDER_HR
    hrNow = hrNow < NEXT_DAY_BORDER_HR ? hrNow + 24 : hrNow;

    const currentTime =
        hrNow * 3600 +
        now.getMinutes() * 60 +
        now.getSeconds() +
        now.getMilliseconds() / 1000;
    return currentTime;
}


function getPrevAndNextStop(arriv_times, dept_times) {
    const currentTime = getCurrentTimeInSeconds();

    if (currentTime < timeToSeconds(arriv_times[0])) {
        console.log("Before first stop");
        return -1;
    }

    for (let i = 1; i < arriv_times.length; i++) {
        prev_arriv = timeToSeconds(arriv_times[i - 1]);
        prev_dept = timeToSeconds(dept_times[i - 1]);

        arr = timeToSeconds(arriv_times[i]);
        dept = timeToSeconds(dept_times[i]);

        if (prev_dept <= currentTime && currentTime <= arr) {
            return [i - 1, i];
        } else if (currentTime < prev_dept) {
            return [i - 1, i - 1];
        }
    }

    // After last stop
    return -1;
}

function getPosWIntermediatePoints(coordsBetween, ratio) {
    // Get current bus position by using intermediate points between stops:
    // Calculate the total length using these points, then find the intermediate points between which the bus is
    // And putting the bus between those intermediate points according to the ratio

    // Find the total length between the stops
    let lenBetweenStops = 0;
    for (let i = 1; i < coordsBetween.length; i++) {
        const [lat1, lon1] = coordsBetween[i - 1];
        const [lat2, lon2] = coordsBetween[i];
        lenBetweenStops += Math.sqrt((lat2 - lat1) ** 2 + (lon2 - lon1) ** 2);
    }

    // Find the position along the intermediate coords based on the ratio
    let len_traveled = ratio * lenBetweenStops;
    let len_so_far = 0;
    for (let i = 1; i < coordsBetween.length; i++) {
        const [lat1, lon1] = coordsBetween[i - 1];
        const [lat2, lon2] = coordsBetween[i];
        const segmentLen = Math.sqrt((lat2 - lat1) ** 2 + (lon2 - lon1) ** 2);
        if (len_so_far + segmentLen >= len_traveled) {
            const segmentRatio = (len_traveled - len_so_far) / segmentLen;
            const lat = lat1 + segmentRatio * (lat2 - lat1);
            const lon = lon1 + segmentRatio * (lon2 - lon1);
            const latLonDiff = [lat2 - lat1, lon2 - lon1];
            // console.log('Using new method');
            const closestPoint = segmentRatio < 0.5 ? [lat1, lon1] : [lat2, lon2];
            return new TripPosData(_busPos=[lat, lon], _latLonDiff=latLonDiff, _closestPoint=closestPoint);
        }
        len_so_far += segmentLen;
    }
}

class TripPosData {
    constructor(_busPos, _latLonDiff, _closestPoint) {
        this.busPos = _busPos;
        this.latLonDiff = _latLonDiff;
        this.closestPoint = _closestPoint;
    }
}

function getTripPos(tripData, prevNext) {
    const tripId = tripData.trip_id;
    const lats = tripData.stop_lat;
    const lons = tripData.stop_lon;
    if (prevNext == -1) {
        console.log('after last stop', tripData);
        const lastStop = [lats[lats.length - 1], lons[lons.length - 1]];
        return new TripPosData(_busPos=lastStop, _latLonDiff=[0, 0], _closestPoint=lastStop);
    }
    const [prevStop, nextStop] = prevNext;
    const prevDept = timeToSeconds(tripData.departure_time[prevStop]);
    const nextArriv = timeToSeconds(tripData.arrival_time[nextStop]);
    const [prevLat, prevLon] = [lats[prevStop], lons[prevStop]];
    const [nextLat, nextLon] = [lats[nextStop], lons[nextStop]];
    const currentTime = getCurrentTimeInSeconds();

    const ratio = (currentTime - prevDept) / (nextArriv - prevDept);

    const tripCoords = net_pylines[tripId];
    if (tripCoords) {
        metersPerDegLat = 111_320;
        const radius_m = 35; // 50m radius for matching stops to polyline coords
        const eps_lat = radius_m / metersPerDegLat;
        const epsLon = radius_m / (metersPerDegLat * Math.cos(48.53 * Math.PI / 180));

        const idxStart = tripCoords.findIndex(coord => Math.abs(coord[0] - prevLat) < eps_lat && Math.abs(coord[1] - prevLon) < epsLon);
        const idxEnd = tripCoords.findIndex(coord => Math.abs(coord[0] - nextLat) < eps_lat && Math.abs(coord[1] - nextLon) < epsLon);
        if (idxStart == -1 || idxEnd == -1) {
            // Fallback to the basic of just using the two stops
            const latLonDiff = [ratio * (nextLat - prevLat), ratio * (nextLon - prevLon)];
            const lat = prevLat + ratio * (nextLat - prevLat);
            const lon = prevLon + ratio * (nextLon - prevLon);

            // console.log('using fallback');
            closestPoint = ratio < 0.5 ? [prevLat, prevLon] : [nextLat, nextLon];
            return new TripPosData(_busPos=[lat, lon], _latLonDiff=latLonDiff, _closestPoint=closestPoint);
        }
        // New method: Try to use intermediate coords
        coordsBetween = tripCoords.slice(Math.min(idxStart, idxEnd), Math.max(idxStart, idxEnd) + 1);
        // Still at same stop (waiting time): return this stop's coords
        if (idxStart == idxEnd) {
            return new TripPosData(_busPos=[prevLat, prevLon], _latLonDiff=[0, 0], _closestPoint=[prevLat, prevLon]);
        }

        return getPosWIntermediatePoints(coordsBetween, ratio);
    }

    const latLonDiff = [ratio * (nextLat - prevLat), ratio * (nextLon - prevLon)];
    const lat = prevLat + ratio * (nextLat - prevLat);
    const lon = prevLon + ratio * (nextLon - prevLon);

    console.log('using extreme fallback for line', tripData.route_short_name, 'with coords', [lat, lon], "id", tripId, "pylines entry", tripCoords);
    return [[lat, lon], latLonDiff];
}
