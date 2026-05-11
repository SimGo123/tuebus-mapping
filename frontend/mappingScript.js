// 1. Initialize map
const map = L.map('map').setView([48.53, 9.05], 13);

// 2. Add tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Store layers so we can manage them later
const markers = [];
const polylines = [];

var busMarkers = {};

var highlightedLine = null;

// 3. Function: add marker
function addMarker(coord, popupText = "") {
    const lat = coord[0];
    const lng = coord[1];
    const marker = L.marker([lat, lng]).addTo(map);
    if (popupText) marker.bindPopup(popupText);
    markers.push(marker);
    return marker;
}

function addStopMarker(coord, popupText = "") {
    const lat = coord[0];
    const lng = coord[1];

    const marker = L.circleMarker([lat, lng], {
        radius: 4,          // size of the dot
        color: "#0066ff",   // border color
        fillColor: "#3399ff",
        fillOpacity: 1,
        weight: 2
    }).addTo(map);

    if (popupText) marker.bindPopup(popupText);

    markers.push(marker);
    return marker;
}

function syncBusMarkers(updates) {
    const nextKeys = new Set(Object.keys(updates));

    // 1. Update existing + add new
    for (const [key, data] of Object.entries(updates)) {
        if (busMarkers[key]) {
            // update existing marker position
            // console.log(`Updating bus ${key} position to ${data.coord}`);
            busMarkers[key].setLatLng(data.coord);
            // Draw triangle indicating direction on the bus marker
        } else {
            // create new marker
            busMarkers[key] = getBusMarker(data.coord, popupText = data.popup, label = data.label, trip = key);
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
}

function getBusMarker(coord, popupText = "", label = "", trip = null, onclickFunc) {
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
        clearPolylines();
        addPolylines(net_pylines);
    });

    // Unhighlight line on popup close
    marker.on("popupclose", function () {
        highlightedLine = null;
        clearPolylines();
        addPolylines(net_pylines);
    });

    return marker;
}

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

function addPolylines(polylinesDict) {
    Object.values(polylinesDict).forEach(line => {
        _addPolyline(line, { "color": "gray" });
    });
    if (highlightedLine && polylinesDict[highlightedLine]) {
        _addPolyline(polylinesDict[highlightedLine], { "color": "red" });
    }
}

// 5. Optional: clear helpers
function clearMarkers() {
    markers.forEach(m => map.removeLayer(m));
    markers.length = 0;
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
