import base64
import json
import os
import requests
import secrets
import time
from urllib.parse import urlencode
from cs50 import SQL
from dotenv import load_dotenv
from flask import Flask, flash, redirect, render_template, request, session, jsonify
from flask_session import Session
from helpers import apology, login_required, auth_required
from werkzeug.security import check_password_hash, generate_password_hash

load_dotenv(override=True)

# Configure application
app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY")
redirect_uri = "http://127.0.0.1:5000/callback"

# For Spotify API
client_id_spotify = os.environ.get("CLIENT_ID_SPOTIFY")
client_secret_spotify = os.environ.get("CLIENT_SECRET_SPOTIFY")

# Configure session to use filesystem (instead of signed cookies)
app.config["SESSION_PERMANENT"] = False
app.config["SESSION_TYPE"] = "filesystem"

Session(app)

# Configure CS50 Library to use SQLite database
db = SQL("sqlite:///interlude.db")

@app.after_request
def after_request(response):
    """Ensure responses aren't cached"""
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Expires"] = 0
    response.headers["Pragma"] = "no-cache"
    return response

@app.route("/")
@login_required
def index():
    """For 'Hello' message personalized to the user."""
    username = db.execute(
        "SELECT username FROM users WHERE id = ?", session.get("user_id")
    )

    """Show user's record collection"""
    return render_template("index.html", user=username, api_access=session.get("api_access", False))


@app.route("/register", methods=["GET", "POST"])
def register():
    """Register User"""
    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")
        confirmation = request.form.get("confirmation")
        # Ensure username was submitted
        if not username:
            flash("You'll need a username.", "info")

        # Ensure password was submitted
        elif not password:
            flash("You must keep a password.", "info")

        # Ensure password matches
        elif password != confirmation:
            flash("Passwords do not match.", "error")

        else:
            try:
                db.execute("INSERT INTO users (username, hash) VALUES(?,?)", username, generate_password_hash(password))
                flash("You are now registered!", "success")

            except ValueError:
                flash("Username already exists.", "error")
                
        return redirect("/")
    else:
        return render_template("login.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    """Log user in"""

    # User reached route via POST (as by submitting a form via POST)
    if request.method == "POST":
        # Forget any user_id
        session.clear()
        # Ensure username was submitted
        if not request.form.get("username"):
            flash("Must provide a username.", "info")

        # Ensure password was submitted
        elif not request.form.get("password"):
            flash("Must provide a password.", "info")

        else:
            # Query database for username
            rows = db.execute(
                "SELECT * FROM users WHERE username = ?", request.form.get("username")
            )

            # Ensure username exists and password is correct
            if len(rows) != 1 or not check_password_hash(
                rows[0]["hash"], request.form.get("password")
            ):
                flash("Invalid username and/or password.", "warning")
            else:
                # Remember which user has logged in
                session["user_id"] = rows[0]["id"]

                # Redirect user to home page
                flash("Logged in successfully!", "success")
        return redirect("/")

    # User reached route via GET (as by clicking a link or via redirect)
    else:
        return render_template("login.html")


@app.route("/logout")
def logout():
    """Log user out"""

    # Forget any user_id
    session.clear()

    flash("Logged out successfully!", "success")

    # Redirect user to login form
    return redirect("/")


@app.route("/api/auth")
def api_auth():
    """Protects from CSRF attacks"""
    state = secrets.token_urlsafe(16)

    scopes = [
        "user-read-recently-played",
        "user-top-read",
        "user-modify-playback-state",
        "user-read-playback-state",
        "streaming",
        "user-read-email",
        "user-read-private",
        "user-read-currently-playing",
    ]
    scope = " ".join(scopes)
    session["oauth_state"] = state

    params = {
        "client_id": client_id_spotify,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": scope,
        "state": state,
        "show_dialog": "true",
    }

    auth_url = "https://accounts.spotify.com/authorize?" + urlencode(params)
    return redirect(auth_url)


@app.route("/callback")
def callback():
    # Explicitly handling denial/cancel
    if request.args.get("error"):
        session.pop("oauth_state", None)
        return redirect("/")
    
    # Getting query parameters
    code = request.args.get("code")
    state = request.args.get("state")

    if state != session.get("oauth_state") or not code:
        session.pop("oauth_state", None)
        return redirect("/")
        
    if not client_id_spotify or not client_secret_spotify:
        session.pop("oauth_state", None)
        flash("Missing Spotify client id/secret", "warning")

    basic = base64.b64encode(f"{client_id_spotify}:{client_secret_spotify}".encode("utf-8")).decode("utf-8")

    # Token exchange using Basic Auth
    response = requests.post(
        "https://accounts.spotify.com/api/token",
        headers={
            "Authorization": f"Basic {basic}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
        },
        timeout=15,
    )

    if not response.ok:
        session.pop("oauth_state", None)
        return redirect("/api/auth")

    # Received token data from the API
    token_data = response.json()
    access_token = token_data.get("access_token")
    refresh_token = token_data.get("refresh_token")
    expires_in = token_data.get("expires_in", 3600)

    if not access_token:
        session.pop("oauth_state", None)
        return redirect("/")
        
    # Setting session state for icon css
    session["api_access"] = True
    session["access_token"] = access_token
    if refresh_token:
        session["refresh_token"] = refresh_token
    session["expires_at"] = int(time.time()) + int(expires_in)
    session.pop("oauth_state", None)
    
    flash("You are now connected to Spotify!", "success")
    return redirect("/")


@app.route("/api/refresh", methods=["POST"])
@login_required
@auth_required
def api_refresh():
    return jsonify({"ok": True}), 200


@app.route("/api/status")
@login_required
def api_status():
    return jsonify({"api_access": session.get("api_access", False)}), 200


@app.route("/api/top-tracks")
@login_required
@auth_required
def top_tracks():
    access_token = session.get("access_token")

    response = requests.get(
        "https://api.spotify.com/v1/me/top/tracks",
        headers = {
            "Authorization": f"Bearer {access_token}"
        },
        params={
            "limit": 50,
            "time_range": "long_term"
        },
        timeout=15
    )

    return jsonify(response.json()), response.status_code


@app.route("/api/search", methods=["POST"])
@login_required
@auth_required
def search():
    value = request.json["value"]
    access_token = session.get("access_token")

    response = requests.get(
        "https://api.spotify.com/v1/search",
        headers = {
            "Authorization": f"Bearer {access_token}"
        },
        params={
            "q": value,
            "type": "track",
            "limit": 50
        },
        timeout=15
    )
    return jsonify(response.json()), response.status_code


@app.route("/api/play-track", methods=["POST"])
@login_required
@auth_required
def play_track():
    uri = request.json["uri"]
    position_ms = request.json["position_ms"]

    if not uri or position_ms is None:
        return jsonify({"error": "Missing uri or position_ms"}), 400
    
    access_token = session.get("access_token")

    devices_response = requests.get(
        "https://api.spotify.com/v1/me/player/devices",
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
            },
        timeout=15
    )
    
    if not devices_response.ok:
        return jsonify({"error": "Failed to fetch devices", "message": devices_response.text}), devices_response.status_code

    devices = devices_response.json().get("devices", [])
    if not devices:
        return jsonify({
            "error": "No devices found",
            "message": "Please open Spotify on a device.",
            "category": "error"}), 400
    
    active = next((device for device in devices if device.get("is_active")), None)
    device_id = (active or devices[0]).get("id")
    if not device_id:
        return jsonify({"error": "Device id missing"}), 400
    
    payload = {
        "uris": [uri],
        "position_ms": position_ms,
    }

    response = requests.put(
        "https://api.spotify.com/v1/me/player/play",
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        },
        params={
            "device_id": device_id
        },
        json=payload,
        timeout=15
    )

    if response.status_code == 204:
        return jsonify({"status": "Playback Started"}), 200
    
    return jsonify({"error": "Failed to start playback", "message": response.text}), response.status_code
    

@app.route("/api/pause-track", methods=["POST"])
@login_required
@auth_required
def pause_track():
    access_token = session.get("access_token")

    response = requests.put(
        "https://api.spotify.com/v1/me/player/pause",
        headers = {
            "Authorization": f"Bearer {access_token}"
        },
        timeout=15
    )

    if response.status_code == 204:
        return jsonify({"status": "Playback Paused"}), 200
    
    return jsonify({"error": "Pause Unsuccessful", "message": response.text}), response.status_code


@app.route("/api/currently-playing")
@login_required
@auth_required
def currently_playing():
    access_token = session.get("access_token")

    response = requests.get(
        "https://api.spotify.com/v1/me/player/currently-playing",
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        },
        timeout=15
    )

    # Nothing is playing
    if response.status_code == 204:
        return jsonify(None), 204
    
    # Error from API
    if response.status_code != 200:
        return jsonify({"error": "API error", "message": response.text}), response.status_code
    
    return jsonify(response.json()), 200


@app.route("/api/set-queue", methods=["PUT"])
@login_required
@auth_required
def set_queue():
    data = request.json["queue"]
    queue = json.dumps(data)
    # Put queue in the database
    db.execute(
        "UPDATE users SET queue = ? WHERE id = ?", queue, session.get("user_id")
    )

    return jsonify({"status": "ok"}), 200


@app.route("/api/get-queue")
@login_required
@auth_required
def get_queue():
    response = db.execute(
        "SELECT queue FROM users WHERE id = ?", session.get("user_id")
    )

    queue = response[0]["queue"]
    return queue


@app.route("/api/get-tracks", methods=["POST"])
@login_required
@auth_required
def get_tracks():
    ids = request.json["ids"]

    if (len(ids) == 0):
        return jsonify({"error": "List is empty"}), 400
    
    access_token = session.get("access_token")

    response = requests.get(
        "https://api.spotify.com/v1/tracks",
        headers = {
            "Authorization": f"Bearer {access_token}"
        },
        params={
            "ids": ",".join(ids)
        },
        timeout=15
    )
    return jsonify(response.json()), response.status_code


@app.route("/api/available-devices")
@login_required
@auth_required
def available_devices():
    access_token = session.get("access_token")

    response = requests.get(
        "https://api.spotify.com/v1/me/player/devices",
        headers = {"Authorization": f"Bearer {access_token}"},
        timeout=15
    )

    if response.status_code != 200: 
        return jsonify({"error": "Failed to fetch devices."}), response.status_code

    devices = response.json().get("devices", [])

    if not devices:
        return jsonify({"error": "No devices found."}), 404

    device = devices[0]["name"]
    return jsonify(device), response.status_code


if __name__ == "__main__":
    app.run(debug=True, use_reloader=False)