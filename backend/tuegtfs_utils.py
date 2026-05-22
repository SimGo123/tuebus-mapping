import gtfs_kit as gk
import pandas as pd
import os
import json
from gtfs_kit import Feed
from datetime import datetime

folder = os.path.dirname(os.path.abspath(__file__))
FEED_ZIP = os.path.join(folder, "naldo.zip")
feed: Feed = gk.read_feed(FEED_ZIP, dist_units="km")

TUE_COORDS = [48.53, 9.05]

agency: pd.DataFrame = feed.agency
TUE_AGENCY_NAMES_START = ["Stadtverkehr Tü", "Omnibus Groß", "Friedrich Müller Omni"]
TUE_AGENCIES = list(agency[agency["agency_name"].str.startswith(tuple(TUE_AGENCY_NAMES_START))]["agency_id"])

NEXT_DAY_BORDER_HR = 4

PRECALC_ROUTES_FILE = os.path.join(folder, "street-routes", "tue_map_routes.json")

routes: pd.DataFrame = feed.routes
stop_times: pd.DataFrame = feed.stop_times
stops: pd.DataFrame = feed.stops

def get_all_tue_routes():
    tue_routes = routes[routes["agency_id"].isin(TUE_AGENCIES)]
    return list(tue_routes["route_id"])

def get_tue_routes_table():
    ln_row = routes[routes["agency_id"].isin(TUE_AGENCIES)]
    return ln_row

def get_route_ids(line_str):
    ln_row = routes[routes["route_short_name"].str.fullmatch(line_str) & routes["agency_id"].isin(TUE_AGENCIES)]
    ln_ids = list(ln_row["route_id"])
    return ln_ids

def filter_by_line_id(df: pd.DataFrame, line_id: str):
    filtered = df[df["trip_id"].str.contains(line_id)]
    return filtered

def _get_datetime_now() -> datetime:
    """Return specific datetime (if required for testing)

    Returns:
        datetime: _description_
    """
    # tomorrow @ 0h30
    # tomorrow = datetime.now() + pd.Timedelta(days=1)
    # return tomorrow.replace(hour=00, minute=30, second=30)
    
    return datetime.now()

_stop_times_today_cache: dict = {}

def get_tue_stop_times_today() -> pd.DataFrame:
    global _stop_times_today_cache

    dt_now = _get_datetime_now()
    hr_now = dt_now.hour

    # Deal with night buses: Assumption is that they belong to the previous day until 4am
    if hr_now < NEXT_DAY_BORDER_HR:
        dt_now = dt_now - pd.Timedelta(days=1)

    date_now = dt_now.strftime("%Y%m%d")

    if date_now in _stop_times_today_cache:
        return _stop_times_today_cache[date_now]

    tue_routes = get_all_tue_routes()
    routes_joined = "|".join(tue_routes)

    active_services = gk.get_active_services(feed, date_now)
    active_joined = "|".join([f"-{acs}-" for acs in active_services])

    tue_stop_times = stop_times[stop_times["trip_id"].str.contains(routes_joined)]
    tue_stop_times = tue_stop_times[tue_stop_times["trip_id"].str.contains(active_joined)]

    merged = tue_stop_times.merge(stops, on="stop_id")

    _stop_times_today_cache = {date_now: merged}
    return merged

def filter_trips_now(df: pd.DataFrame) -> pd.DataFrame:
    """Doesn't filter for trips not today, just by time

    Args:
        df (pd.DataFrame): _description_

    Returns:
        pd.DataFrame: _description_
    """
    tmp = df[["trip_id", "arrival_time", "departure_time"]]
    tmp["row_min"] = df[["arrival_time", "departure_time"]].min(axis=1)
    tmp["row_max"] = df[["arrival_time", "departure_time"]].max(axis=1)
    
    grpd = tmp.groupby("trip_id")
    trips_min_max = grpd.agg({
        "row_min": "min",
        "row_max": "max"
    }).reset_index()
    
    now = _get_datetime_now()
    now_tdelta = pd.to_timedelta(_get_datetime_now().strftime("%H:%M:%S"))
    if now.hour < NEXT_DAY_BORDER_HR:
        now_tdelta += pd.Timedelta(days=1)

    trips_min_max["row_min"] = pd.to_timedelta(trips_min_max["row_min"])
    # Timedelta for sparse updates (already have lines that start a bit later)
    trips_min_max["row_max"] = pd.to_timedelta(trips_min_max["row_max"]) + pd.Timedelta(minutes=2)

    filtered = trips_min_max[
        (now_tdelta >= trips_min_max["row_min"]) &
        (now_tdelta <= trips_min_max["row_max"])
    ]
    trip_ids_now = filtered["trip_id"].drop_duplicates()
    
    return df[df["trip_id"].isin(trip_ids_now)]


def add_lines_to_stop_times(stop_times_df: pd.DataFrame) -> pd.DataFrame:
    routes_table = get_tue_routes_table()
    tmp = stop_times_df.merge(routes_table, how="cross")
    res = tmp[
        tmp.apply(lambda r: r["route_id"] in r["trip_id"], axis=1)
    ]
    return res

def get_stop_times(trip_id):
    # stop_times_ln = stop_times[stop_times["trip_id"].str.contains(ln_id)]
    # first_trip_id = set(stop_times_ln["trip_id"]).pop()
    
    stop_times_trip = stop_times[stop_times["trip_id"].str.fullmatch(trip_id)]
    stop_ids = set(stop_times_trip["stop_id"])

    ln_stops = stops[stops["stop_id"].isin(stop_ids)]

    # Merge to sort by time
    merged = stop_times_trip.merge(ln_stops, on="stop_id")
    
    return merged


def get_prev_and_next_stop(merged):
    now = _get_datetime_now().strftime("%H:%M:%S")

    for i in range(1, len(merged)):
        prev_row = merged.iloc[i - 1]
        row = merged.iloc[i]

        if prev_row["departure_time"] <= now <= row["arrival_time"]: # TODO at a stop (dep != arr time)
            return merged.iloc[[i - 1, i]]
        elif now <= prev_row["departure_time"]:
            return merged.iloc[[i - 1, i - 1]]
    raise ValueError(f"Unmatched. Trip id: {merged.iloc[-1]['trip_id']}, Last time: {merged.iloc[-1]['departure_time']}")
        
def get_trip_pos(trip_id):
    stop_times_mgd = get_stop_times(trip_id=trip_id)
    
    try:
        stops_frame = get_prev_and_next_stop(stop_times_mgd)
    except ValueError:
        # print("Already too late, returning last stop pos...")
        last_row = stop_times_mgd.iloc[-1]
        return (last_row["stop_lat"], last_row["stop_lon"])

    # TODO improve: use road network instead of average
    coords = get_coords(stops_frame)
    x0, y0 = coords[0]
    x1, y1 = coords[1]

    dx = x1 - x0
    dy = y1 - y0

    # --- time conversion ---
    now = datetime.strptime(_get_datetime_now().strftime("%H:%M:%S"), "%H:%M:%S")
    t0 = datetime.strptime(stops_frame.iloc[0]["departure_time"], "%H:%M:%S")
    t1 = datetime.strptime(stops_frame.iloc[1]["arrival_time"], "%H:%M:%S")

    total = (t1 - t0).total_seconds()
    elapsed = (now - t0).total_seconds()

    # --- safety ---
    if total <= 0:
        frac = 0
    else:
        frac = max(0, min(1, elapsed / total))

    # --- interpolation ---
    approx_loc = (x0 + frac * dx, y0 + frac * dy)
    
    return approx_loc

def get_coords(df):
    coords = [(stop["stop_lat"], stop["stop_lon"]) for _, stop in df.iterrows()]
    return coords


def get_tue_stops() -> pd.DataFrame:
    tue_stop_times = get_tue_stop_times_today()
    tue_stop_data = tue_stop_times[["stop_id", "stop_name", "stop_lat", "stop_lon"]].drop_duplicates().reset_index(drop=True)
    return tue_stop_data

def get_all_route_polylines() -> dict:
    stop_times_now = filter_trips_now(get_tue_stop_times_today()) # get_tue_stop_times_today()
    grpd = stop_times_now.groupby("trip_id")
    agg = grpd[["stop_lat", "stop_lon"]].agg(list)
    coords = agg.apply(lambda r: list(zip(r["stop_lat"], r["stop_lon"])), axis=1)
    
    with open(PRECALC_ROUTES_FILE, "r") as f:
        routes = json.load(f)
    
    def process_pair(pair):
        if str(pair) in routes:
            return routes[str(pair)]["route_coords"]
        else:
            return list(pair) # Just draw a straight line if no route is found

    coords = coords.apply(lambda r: list(zip(r[:-1], r[1:])))
    # replace pairs with route coords
    coords = coords.apply(lambda r: [process_pair(pair) for pair in r])
    # flatten
    coords = coords.apply(lambda r: [pair for pairs in r for pair in pairs])

    return coords.to_dict()
