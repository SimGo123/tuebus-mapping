// 1. Initialize map
const map = L.map('map').setView([48.53, 9.05], 13);

// 2. Add tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Store layers so we can manage them later
var stopMarkers = [];
var busMarkers = {};

const polylines = [];

var highlightedLine = null;
var stopIdsToHighlight = null;

const deselectBtn = document.getElementById("deselectBtn");

// 3. Function: add marker
function addMarker(coord, popupText = "") {
    const lat = coord[0];
    const lng = coord[1];
    const marker = L.marker([lat, lng]).addTo(map);
    if (popupText) marker.bindPopup(popupText);
    stopMarkers.push(marker);
    return marker;
}

function syncBusMarkers(updates, sparseUd) {
    const nextKeys = new Set(Object.keys(updates));

    // 1. Update existing + add new
    for (const [key, data] of Object.entries(updates)) {
        res = createBusPopupDescr(data.tripData, data.prevNext);
        [line, popup, colStyles, stopNamesPopup, lastStopName] = res;
        if (busMarkers[key]) {
            // update existing marker position
            // console.log(`Updating bus ${key} position to ${data.coord}`);
            busMarkers[key].setLatLng(data.coord);

            // Update which station gets which color in the popup
            const popupEl = busMarkers[key].getPopup().getElement();
            if (popupEl) {
                popupEl.querySelector("#last-stop-name").textContent = lastStopName;
                popupEl.querySelectorAll('.stop-item').forEach((el, i) => {
                    el.style = colStyles[i];
                    el.innerHTML = stopNamesPopup[i];
                });
            }

            net_pylines[key]["closestPoint"] = data.closestPoint;
        } else {
            // create new marker
            busMarkers[key] = getBusMarker(data.coord, popupText = popup, label = line, trip = key, stopIds = data.stopIds);
        }
        setArrowDirection(busMarkers[key], data.latLonDiff);
    }

    // 2. Remove markers not in update
    for (const key of Object.keys(busMarkers)) {
        if (!nextKeys.has(key)) {
            map.removeLayer(busMarkers[key]);
            delete busMarkers[key];
        }
    }
    
    clearPolylines();
    addPolylines();
}

function getBusMarker(coord, popupText = "", label = "", trip = null, stopIds = null) {
    const lat = coord[0];
    const lng = coord[1];

    if (trip && busMarkers[trip]) {
        busMarkers[trip].setLatLng([lat, lng]);
        return busMarkers[trip];
    }

    const icon = L.divIcon({
        className: "custom-label-marker",
        html: `<div class="marker-wrapper">
                    <div class="marker-circle">${label}</div>
                    <div class="marker-arrow"></div>
                </div>`,
        iconSize: [30, 30],
        iconAnchor: [20, 20]
    });

    const marker = L.marker([lat, lng], { icon }).addTo(map);

    // make bigger for longer labels (line numbers, ie "X82", "828" or night buses)
    if (label.length >= 3) {
        const el = marker.getElement();
        const circle = el.querySelector(".marker-circle");
        circle.style.width = "25px";
        circle.style.height = "25px";
    }

    if (popupText) marker.bindPopup(popupText);

    // Highlight line on click (popup opens automatically)
    marker.on("click", () => {
        console.log(label);
        highlightedLine = trip;
        deselectBtn.style.display = "block";

        clearPolylines();
        addPolylines();

        clearStopMarkers();
        stopIdsToHighlight = stopIds;
        addStopMarkers();
    });

    // marker.on("popupclose", function () { });

    return marker;
}

deselectBtn.addEventListener("click", () => {
    highlightedLine = null;
    clearPolylines();
    addPolylines();

    clearStopMarkers();
    stopIdsToHighlight = null;
    addStopMarkers();

    // Close any open popups
    Object.values(busMarkers).forEach(marker => marker.closePopup());

    deselectBtn.style.display = "none";
});

function dlatDlonToAngle(dlat, dlon) {
    const angleRad = Math.atan2(-dlat, dlon);
    let angleDeg = angleRad * (180 / Math.PI);

    if (angleDeg < 0) angleDeg += 360;

    return angleDeg;
}

function setArrowDirection(marker, coordDiff) {
    const angleDeg = dlatDlonToAngle(coordDiff[0], coordDiff[1]);
    if (!marker) return;
    const el = marker.getElement();
    if (!el) return;
    const arrow = el.querySelector(".marker-arrow");
    if (!arrow) return;

    const rad = (angleDeg * Math.PI) / 180;

    const radius = 18;
    const x = Math.cos(rad) * radius;
    const y = Math.sin(rad) * radius;

    arrow.style.transform = `
            translate(-50%, -50%)
            translate(${x}px, ${y}px)
            rotate(${angleDeg}deg)
        `;
}

// 4. Function: add polyline
function _addPolyline(latlngs, options = {}) {
    const polyline = L.polyline(latlngs, {
        color: options.color || 'blue',
        weight: options.weight || 4
    }).addTo(map);

    polylines.push(polyline);
    return polyline;
}

function addPolylines() {
    Object.values(net_pylines).forEach(line => {
        _addPolyline(line, { "color": "gray" });
    });
    if (highlightedLine && net_pylines[highlightedLine]) {
        if (!net_pylines[highlightedLine]["closestPoint"]) {
            console.log('c1');
            _addPolyline(net_pylines[highlightedLine], { "color": "red" });
        } else {            const coords = net_pylines[highlightedLine];
            const closestPoint = net_pylines[highlightedLine]["closestPoint"];
            const idx = coords.findIndex(c => c[0] === closestPoint[0] && c[1] === closestPoint[1]);
            if (idx !== -1) {
                const before = coords.slice(0, idx + 1);
                const after = coords.slice(idx);
                _addPolyline(before, { "color": "pink" });
                _addPolyline(after, { "color": "red" });
            } else {
                console.log('c2');
                _addPolyline(coords, { "color": "red" });
            }
        }
    }
}

function _addStopMarker(coord, popupText = "", color = "#0066ff", fillColor = "#3399ff") {
    const lat = coord[0];
    const lng = coord[1];

    const marker = L.circleMarker([lat, lng], {
        radius: 4,          // size of the dot
        color: color,       // border color
        fillColor: fillColor,
        fillOpacity: 1,
        weight: 2
    }).addTo(map);

    if (popupText) marker.bindPopup(popupText);

    stopMarkers.push(marker);
    return marker;
}

function addStopMarkers() {
    let addLater = [];
    for (const [stopId, stopData] of Object.entries(stopsDict)) {
        stop_name = stopData.stop_name;
        stop_name = stop_name.replace("Tübingen ", "").trim();
        mark_lat = stopData.stop_lat;
        mark_lon = stopData.stop_lon;
        coord = [mark_lat, mark_lon];
        popup = `<h3>${stop_name}</h3>`;
        if (stopIdsToHighlight && stopIdsToHighlight.includes(stopId)) {
            addLater.push({"coord": coord, "popup": popup});
        } else {
            _addStopMarker(coord, popup);
        }
    }
    // Add highlighted stops later so they are on top of the others
    addLater.forEach(data => _addStopMarker(data.coord, data.popup, color = "red", fillColor = "orange"));
}

// clear helpers
function clearStopMarkers() {
    stopMarkers.forEach(m => map.removeLayer(m));
    stopMarkers.length = 0;
}
function clearBusMarkers() {
    Object.values(busMarkers).forEach(m => map.removeLayer(m));
    busMarkers = {};
}
function clearPolylines() {
    polylines.forEach(p => map.removeLayer(p));
    polylines.length = 0;
}

// Expose to global scope (for console use)
// window.addMarker = addMarker;
// window.addPolyline = addPolyline;
// window.clearMarkers = clearMarkers;
// window.clearPolylines = clearPolylines;
