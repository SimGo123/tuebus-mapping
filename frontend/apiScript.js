async function getAllPolylines() {
    const response = await fetch(`${url}/get-all-polylines`, { method: "POST" });

    const text = await response.text();
    try {
        net_pylines = JSON.parse(text);
    } catch (e) {
        console.error('Error parsing pylines response:', e);
        console.log('pylines resp', text);
    }

    clearPolylines();
    addPolylines();
    getAllStops();
}

async function getAllStops() {
    const response = await fetch(`${url}/get-all-stops`, { method: "POST" });
    const text = await response.text();
    try {
        stopsDict = JSON.parse(text);
    } catch (e) {
        console.error('Error parsing stops response:', e);
        console.log('stops resp', text);
    }

    clearStopMarkers();
    addStopMarkers();
}


async function getBusesFromApi() {
    console.log("awaiting");
    const response = await fetch(`${url}/get-basic-data`, { method: "POST" });
    const text = await response.text();
    try {
        basicData = JSON.parse(text);
    } catch (e) {
        console.error('Error parsing bus response:', e);
        console.log('bus resp', text);
    }
    console.log("got it");
}
