console.log("script started");

const url = "http://localhost:5001";
let alive = true;

const freqBusUpdateSec = 0.3;
const sparseBusUpdateSec = 30; // Update every 30s

const NEXT_DAY_BORDER_HR = 4; // 4am is the border for night buses, they belong to the previous day until then

async function getAllPolylines() {
    const response = await fetch(`${url}/get-all-polylines`, { method: "POST" });
    net_pylines = await response.json();

    clearPolylines();
    addPolylines(net_pylines);
    getAllStops();
}

async function getAllStops() {
    const response = await fetch(`${url}/get-all-stops`, { method: "POST" });
    data = await response.json();

    clearMarkers();
    for (let i = 0; i < data.stop_id.length; i++) {
        stop_id = data.stop_id[i];
        stop_name = data.stop_name[i];
        lat = data.stop_lat[i];
        lon = data.stop_lon[i];
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

    console.log('other condition');
    return -1;
}

function getTripPos(tripData, prevNext) {
    lats = tripData.stop_lat;
    lons = tripData.stop_lon;
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
    const latLonDiff = [ratio * (nextLat - prevLat), ratio * (nextLon - prevLon)];
    const lat = prevLat + ratio * (nextLat - prevLat);
    const lon = prevLon + ratio * (nextLon - prevLon);

    return [[lat, lon], latLonDiff];
}

let basicData = null;

async function getBusesFromApi() {
    console.log("awaiting");
    const response = await fetch(`${url}/get-basic-data`, { method: "POST" });
    basicData = await response.json();
    console.log("got it");
    updateBuses();
}

async function updateBuses() {
    if (basicData == null) {
        console.log("Basic data not loaded yet.");
        return;
    }

    console.time("busUpdate");
    updates = {};
    Object.entries(basicData).forEach(([idx, tripData]) => {
        prevNext = getPrevAndNextStop(tripData.arrival_time, tripData.departure_time);
        if (prevNext == -1) {
            return;
        }
        const [tripPos, latLonDiff] = getTripPos(tripData, prevNext);

        line = tripData.route_short_name;
        descr = tripData.route_long_name;
        tripId = tripData.trip_id;
        popup = `<h3>Linie ${line}</h3>${descr}`;

        updates[tripId] = { coord: tripPos, popup: popup, label: line, latLonDiff: latLonDiff };
    });

    syncBusMarkers(updates);

    console.timeEnd("busUpdate");
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
