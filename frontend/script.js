console.log("script started");

const isCgiServer = false;
if (isCgiServer) {
    var url = "/cgi-bin/app.cgi";
} else {
    var url = "http://localhost:5001";
}

let alive = true;

const freqBusUpdateSec = 0.9;
const sparseBusUpdateSec = 30; // Update every 30s

const NEXT_DAY_BORDER_HR = 4; // 4am is the border for night buses, they belong to the previous day until then

var stopsDict = null;

async function getAllPolylines() {
    const response = await fetch(`${url}/get-all-polylines`, { method: "POST" });
    net_pylines = await response.json();

    clearPolylines();
    addPolylines(net_pylines);
    getAllStops();
}

async function getAllStops() {
    const response = await fetch(`${url}/get-all-stops`, { method: "POST" });
    stopsDict = await response.json();

    clearMarkers();
    for (const [stopId, stopData] of Object.entries(stopsDict)) {
        stop_name = stopData.stop_name;
        lat = stopData.stop_lat;
        lon = stopData.stop_lon;
        coord = [lat, lon];
        popup = `<h3>${stop_name}</h3>`
        addStopMarker(coord, popup);
    }
}

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
    console.log('after last stop');
    return -1;
}

function getTripPos(tripData, prevNext) {
    const tripId = tripData.trip_id;
    const lats = tripData.stop_lat;
    const lons = tripData.stop_lon;
    if (prevNext == -1) {
        return [[lats[lats.length - 1], lons[lons.length - 1]], [0, 0]];
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
            return [[lat, lon], latLonDiff];
        }
        // New method: Try to use intermediate coords
        coordsBetween = tripCoords.slice(Math.min(idxStart, idxEnd), Math.max(idxStart, idxEnd) + 1);
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
                return [[lat, lon], latLonDiff];
            }
            len_so_far += segmentLen;
        }
    }

    const latLonDiff = [ratio * (nextLat - prevLat), ratio * (nextLon - prevLon)];
    const lat = prevLat + ratio * (nextLat - prevLat);
    const lon = prevLon + ratio * (nextLon - prevLon);

    console.log('using extreme fallback');
    return [[lat, lon], latLonDiff];
}

let basicData = null;

async function getBusesFromApi() {
    console.log("awaiting");
    const response = await fetch(`${url}/get-basic-data`, { method: "POST" });
    basicData = await response.json();
    console.log("got it");
    updateBuses(true);
}

function getDescrInOrder(description, lastStopName) {
    splitted = description.split("-");
    spl0 = splitted[0].trim().replace("(", "").replace(")", "");
    if (spl0.includes(lastStopName) || lastStopName.includes(spl0)) {
        return splitted.reverse().join(" - ").replace("(", "").replace(")", "");
    }
    return description;
}

async function updateBuses(isFromApi=false) {
    if (basicData == null) {
        console.log("Basic data not loaded yet.");
        return;
    }

    // console.time("busUpdate");
    try {
        updates = {};
        for (const [idx, tripData] of Object.entries(basicData)) {
            prevNext = getPrevAndNextStop(tripData.arrival_time, tripData.departure_time);
            if (prevNext == -1) {
                continue;
            }
            const [tripPos, latLonDiff] = getTripPos(tripData, prevNext);

            line = tripData.route_short_name;
            descr = tripData.route_long_name;
            tripId = tripData.trip_id;
            lastStopId = tripData.stop_id[tripData.stop_id.length - 1];
            lastStopName = stopsDict[lastStopId] ? stopsDict[lastStopId].stop_name : "Unknown stop";
            lastStopName = lastStopName.replace("Tübingen ", "").replace("Ahornweg", "WHO").replace("Ulmenweg", "WHO");
            descr = getDescrInOrder(descr, lastStopName);
            all_stop_names = tripData.stop_id.map(stopId => stopsDict[stopId] ? stopsDict[stopId].stop_name : "Unknown stop");
            all_stop_names = all_stop_names.map(name => name.replace("Tübingen ", ""));
            descr += "<br><br><div class='stop-list'>"
            colStyles = [];
            for (let i = 0; i < all_stop_names.length; i++) {
                let colStyle = "";
                if (i == prevNext[1]) {
                    colStyle = "color: red; font-weight: bold;";
                    colStyles.push(colStyle);
                } else if (i < prevNext[1]) {
                    colStyle = "color: gray;";
                    colStyles.push(colStyle);
                }
                descr += `<div class='stop-item' style='${colStyle}'><b>${i + 1}.</b> ${all_stop_names[i]}</div>`;
            }
            descr += "</div></div>";
            popup = `<h3>${line}: ${lastStopName}</h3>${descr}`;

            updates[tripId] = { coord: tripPos, popup: popup, label: line, latLonDiff: latLonDiff, colStyles: colStyles };
        }

        syncBusMarkers(updates, isFromApi);
    } finally {
        // console.timeEnd("busUpdate");
    }
}

exCoord = [48.53, 9.03];
exMarker = getBusMarker(exCoord, "<h3>Example Bus</h3>");
latLonDiff = [0.0001, -0.0004];
setArrowDirection(exMarker, latLonDiff);

getAllPolylines();
getAllStops();

getBusesFromApi();

let sparseIntervalId = setInterval(async () => {
    try {
        getAllPolylines();

        getBusesFromApi();
    } catch (error) {
        console.log("Clearing interval...");
        clearInterval(sparseIntervalId);
        throw error;
    }
}, sparseBusUpdateSec * 1000);

let busIntervalId = setInterval(async () => {
    try {
        updateBuses();
    } catch (error) {
        console.log("Clearing interval...");
        clearInterval(busIntervalId);
        throw error;
    }
}, freqBusUpdateSec * 1000);

window.onbeforeunload = async () => {
    alive = false;
    clearInterval(intervalId);
};
