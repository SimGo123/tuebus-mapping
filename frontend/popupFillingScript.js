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

function createBusPopupDescr(tripData, prevNext) {
    line = tripData.route_short_name;
    long_name = tripData.route_long_name;
    tripId = tripData.trip_id;
    lastStopId = tripData.stop_id[tripData.stop_id.length - 1];
    lastStopName = _getShortStopName(lastStopId);

    descr = getDescrInOrder(long_name, lastStopName);
    all_stop_names = tripData.stop_id.map(stopId => stopsDict[stopId] ? stopsDict[stopId].stop_name : "Unknown stop");
    all_stop_names = all_stop_names.map(name => name.replace("Tübingen ", ""));
    descr += "<br><br><div class='stop-list'>"
    colStyles = [];
    stopNamesPopup = [];
    for (let i = 0; i < all_stop_names.length; i++) {
        let colStyle = "";
        if (i == prevNext[1]) {
            colStyle = "color: red; font-weight: bold;";
            colStyles.push(colStyle);
        } else if (i < prevNext[1]) {
            colStyle = "color: gray; display: none;";
            colStyles.push(colStyle);
        }
        stopName = `<b>${i + 1}.</b> ${all_stop_names[i]}`;
        stopNamesPopup.push(stopName);
        descr += `<div class='stop-item' style='${colStyle}'><b>${i + 1}.</b> ${all_stop_names[i]}</div>`;
    }
    descr += "</div></div>";
    popup = `<h3>${line}: <span id="last-stop-name">${lastStopName}</span></h3>${descr}`;
    return [line, popup, colStyles, stopNamesPopup, lastStopName];
}
