console.log("script started");

const url = "http://localhost:5001";
let alive = true;

const freqBusUpdateSec = 1; // Update every second
const sparseBusUpdateSec = 30; // Update every 30s

async function getAllPolylines() {
    const response = await fetch(`${url}/get-all-polylines`, { method: "POST" });
    net_pylines = await response.json();

    clearPolylines();
    Object.entries(net_pylines).forEach(([key, line]) => {
        addPolyline(line, { "color": "gray" });
    });
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

// async function getAllBuses() {
//     console.log("awaiting");
//     const response = await fetch(`${url}/get-all-buses`, { method: "POST" });
//     const data = await response.json();
//     console.log("got it");

//     clearBusMarkers();
//     console.log(data.curr_pos.length);
//     for (let i = 0; i < data.curr_pos.length; i++) {
//         coord = data.curr_pos[i];
//         line = data.route_short_name[i];
//         descr = data.route_long_name[i];
//         trip = data.trip_id[i];
//         popup = `<h3>Linie ${line}</h3>${descr}`
//         addBusMarker(coord, popup, label = line, trip = trip);
//     }

//     console.log("updated");
// }

function timeToSeconds(t) {
  const [h, m, s] = t.split(":").map(Number);
  return h * 3600 + m * 60 + s;
}

function getCurrentTimeInSeconds() {
    const now = new Date();
    const currentTime =
        now.getHours() * 3600 +
        now.getMinutes() * 60 +
        now.getSeconds();
    return currentTime;
}

function getPrevAndNextStop(arriv_times, dept_times) {
    const now = new Date();
    const currentTime = getCurrentTimeInSeconds();

    for (let i = 1; i < arriv_times.length; i++) {
        prev_arriv = timeToSeconds(arriv_times[i - 1]);
        prev_dept = timeToSeconds(dept_times[i - 1]);

        arr = timeToSeconds(arriv_times[i]);
        dept = timeToSeconds(dept_times[i]);

        if (prev_dept <= currentTime && currentTime <= arr) {
            return [i-1, i];
        } else if (currentTime < prev_dept) {
            return [i-1, i-1];
        }
    }
    return -1;
}

function getTripPos(tripData, prevNext) {
    lats = tripData.stop_lat;
    lons = tripData.stop_lon;
    if (prevNext == -1) {
        return [lats[lats.length-1], lons[lons.length-1]];
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

    updates = {};
    Object.entries(basicData).forEach(([idx, tripData]) => {
        prevNext = getPrevAndNextStop(tripData.arrival_time, tripData.departure_time);
        const [tripPos, latLonDiff] = getTripPos(tripData, prevNext);
        
        line = tripData.route_short_name;
        descr = tripData.route_long_name;
        tripId = tripData.trip_id;
        popup = `<h3>Linie ${line}</h3>${descr}`;

        updates[tripId] = { coord: tripPos, popup: popup, label: line, latLonDiff: latLonDiff };
    });

    syncBusMarkers(updates);
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
        getAllStops();

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

// getAllBuses();
// let intervalId = setInterval(async () => {
//     try {
//         console.log("trying...");
//         await getAllBuses();
//     } catch {
//         console.log("Clearing interval...");
//         clearInterval(intervalId);
//     }
// }, 5000);

window.onbeforeunload = async () => {
    alive = false;
    clearInterval(intervalId);
};
