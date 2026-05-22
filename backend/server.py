import traceback
import sys
from os.path import join, dirname, abspath

from flask import Flask, jsonify, request
from flask_cors import CORS

import tuegtfs_utils as tuegtfs_utils

BASE_DIR = dirname(abspath(__file__))

app = Flask(
    __name__,
    static_folder=join(BASE_DIR, "../frontend"),
    static_url_path="/frontend"
)

CORS(app)

@app.errorhandler(Exception)
def handle_exception(e):
    return (
        f"<h1>Flask Error: {type(e).__name__}</h1>"
        f"<pre>{traceback.format_exc()}</pre>",
        500,
        {"Content-Type": "text/html"},
    )

@app.route("/")
def home():
    with open(join(BASE_DIR, "../frontend/index.html"), "r") as f:
        return f.read()

# Simple GET endpoint
@app.route("/hello", methods=["GET"])
def hello():
    return jsonify({"message": "Hello world"})

# Endpoint with query parameter
@app.route("/echo", methods=["GET"])
def echo():
    text = request.args.get("text", "")
    return jsonify({"you_sent": text})

# POST endpoint
@app.route("/data", methods=["POST"])
def data():
    payload = request.json
    return jsonify({"received": payload})

# POST endpoint
@app.route("/get-bus", methods=["POST"])
def get_bus():
    # payload = request.json
    line_id = tuegtfs_utils.get_route_ids("4")[0]
    trips_now = tuegtfs_utils.filter_trips_now(tuegtfs_utils.get_tue_stop_times_today())
    trip_id = tuegtfs_utils.filter_by_line_id(trips_now, line_id=line_id)["trip_id"].iloc[0]
    bus_loc = tuegtfs_utils.get_trip_pos(trip_id=trip_id)
    return jsonify({"bus_loc": bus_loc})

@app.route("/get-all-polylines", methods=["POST"])
def get_all_route_polylines():
    # print("polylines requested...")
    polylines = tuegtfs_utils.get_all_route_polylines()
    return jsonify(polylines)

@app.route("/get-all-stops", methods=["POST"])
def get_all_stops():
    stops = tuegtfs_utils.get_tue_stops()
    stops = stops[["stop_id", "stop_name", "stop_lat", "stop_lon"]]
    stops_dict = stops.set_index("stop_id").to_dict(orient="index")
    return jsonify(stops_dict)

@app.route("/get-all-buses", methods=["POST"])
def get_all_buses():
    reduced = tuegtfs_utils.get_tue_stop_times_today()[["trip_id", "arrival_time", "departure_time"]]
    filtered = tuegtfs_utils.filter_trips_now(reduced)
    agg = filtered.groupby("trip_id").agg("first").reset_index()
    trips = tuegtfs_utils.add_lines_to_stop_times(agg)
    
    trips["curr_pos"] = trips["trip_id"].apply(tuegtfs_utils.get_trip_pos)
    trips = trips[["trip_id", "route_id", "route_short_name", "route_long_name", "curr_pos"]]
    trips_dict = trips.to_dict(orient="list")
    return jsonify(trips_dict)

@app.route("/get-basic-data", methods=["POST"])
def get_basic_data():
    # print("basic data requested...")
    reduced = tuegtfs_utils.get_tue_stop_times_today()[["trip_id", "arrival_time", "departure_time", "stop_lat", "stop_lon", "stop_id"]]
    filtered = tuegtfs_utils.filter_trips_now(reduced)
    grpd = filtered.groupby("trip_id")
    agg = grpd[["arrival_time", "departure_time", "stop_lat", "stop_lon", "stop_id"]].agg(list).reset_index()
    agg_lines = tuegtfs_utils.add_lines_to_stop_times(agg)
    agg_lines_dict = agg_lines.to_dict(orient="index")
    return jsonify(agg_lines_dict)

if __name__ == "__main__":
    app.run(debug=True, use_reloader=False, host="0.0.0.0", port=5003)
