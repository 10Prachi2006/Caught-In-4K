"""
The HTTP bridge: AI pipeline --POST--> FastAPI backend.
Non-fatal on failure so your AI run doesn't crash if the backend isn't
up yet - it just prints a warning and keeps processing the video.
"""

import requests

BACKEND_URL = "http://127.0.0.1:8000/api/v1/sightings"


def send_sighting(sighting: dict, timeout: float = 5.0):
    try:
        response = requests.post(BACKEND_URL, json=sighting, timeout=timeout)
        response.raise_for_status()
        result = response.json()

        if result.get("watchlist_match"):
            alert = result["alert"]
            if alert.get("match_type") == "possible":
                print(f"  ⚠️  POSSIBLE MATCH: {result['plate_number']} "
                      f"(verify against watchlist plate {alert['matched_plate']}) "
                      f"-> {alert['status']} ({alert['priority']})")
            else:
                print(f"  🚨 WATCHLIST MATCH: {result['plate_number']} "
                      f"-> {alert['status']} ({alert['priority']})")
        else:
            print(f"  Stored sighting: {result['plate_number']} (no watchlist match)")
        return result
    except requests.exceptions.ConnectionError:
        print(f"  [backend not reachable at {BACKEND_URL} - "
              f"start it with 'uvicorn app.main:app --reload' from backend/]")
        return None
    except requests.exceptions.RequestException as e:
        print(f"  [backend rejected sighting: {e}]")
        return None