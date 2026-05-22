console.log("script started");

const url = "";

let alive = true;

const freqBusUpdateSec = 0.9;
const sparseBusUpdateSec = 30; // Update every 30s


function getDescrInOrder(description, lastStopName) {
    splitted = description.split("-");
    spl0 = splitted[0].trim().replace("(", "").replace(")", "");
    lsn = lastStopName.replace("Ri. ", "").trim();
    if (spl0.includes(lsn) || lsn.includes(spl0) || (spl0 == "Tübingen" && lsn.includes("Hauptbahnhof"))) {
        return splitted.reverse().join(" - ").replace("(", "").replace(")", "");
    }
    return description;
}

function _getShortStopName(stopId) {
    let shortStopName = stopsDict[stopId] ? stopsDict[stopId].stop_name : "Unknown stop";
    shortStopName = shortStopName
        .replace("Tübingen ", "")
        .replace("Ahornweg", "Waldhäuser Ost")
        .replace("Ulmenweg", "Waldhäuser Ost")
        .replace("Kleiststraße", "Österberg")
        .replace("Carlo-Steeb-Str.", "Aeulestraße")
        .replace("Wennf. Garten", "Wennfelder Garten")
        .replace("Nelkenweg", "Gartenstadt");
    if (shortStopName.includes("Hagelloch ")) {
        shortStopName = "Hagelloch";
    } else if (shortStopName.includes("Pfrondorf ")) {
        shortStopName = "Pfrondorf";
    } else if (shortStopName.includes("Derend")) {
        shortStopName = "Derendingen";
    } else if (shortStopName.includes("Waldenbuch ")) {
        shortStopName = "Ri. Flughafen";
    } else if (shortStopName.includes("Rottenburg ")) {
        shortStopName = "Rottenburg";
    } else if (shortStopName.includes("Sand ")) {
        shortStopName = "Sand";
    }
    return shortStopName;
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

            tripId = tripData.trip_id;
            updates[tripId] = { tripData: tripData, coord: tripPos, latLonDiff: latLonDiff, stopIds: tripData.stop_id, prevNext: prevNext };
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

// Run immeidately
Promise.all([getAllPolylines(), getAllStops(), getBusesFromApi()]).then(() => {
    updateBuses(true);
});

// Run in interval
let sparseIntervalId = setInterval(async () => {
    try {
        await Promise.all([getAllPolylines(), getBusesFromApi(), ...(stopsDict == null ? [getAllStops()] : [])]);
        updateBuses(true);
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
    clearInterval(sparseIntervalId);
    clearInterval(busIntervalId);
};
