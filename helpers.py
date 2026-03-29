import base64
import os
import requests
import time

from flask import redirect, render_template, session, request, jsonify
from functools import wraps


# Not used
def apology(message, code=400):
    """Render message as an apology to user."""

    def escape(s):
        """
        Escape special characters.

        https://github.com/jacebrowing/memegen#special-characters
        """
        for old, new in [
            ("-", "--"),
            (" ", "-"),
            ("_", "__"),
            ("?", "~q"),
            ("%", "~p"),
            ("#", "~h"),
            ("/", "~s"),
            ('"', "''"),
        ]:
            s = s.replace(old,new)
        return s

    return render_template("apology.html", top=code, bottom=escape(message)), code


def login_required(f):
    """
    Decorate routes to require login.

    https://flask.palletsprojects.com/en/latest/patterns/viewdecorators/
    """

    @wraps(f)
    def decorated_function(*args, **kwargs):
        if session.get("user_id") is None:
            return redirect("/login")
        return f(*args, **kwargs)

    return decorated_function


def ensure_token(buffer_seconds: int = 30) -> None:
    """
    Check if access token is valid.

    If access token has expired or is about to expire in buffer_seconds,
    then refresh access token using refresh token.
    """
    refresh_token = session.get("refresh_token")
    if not refresh_token:
        raise PermissionError("Missing refresh_token in session")
    
    access_token = session.get("access_token")
    expires_at = session.get("expires_at")

    now = int(time.time())

    if not access_token or not expires_at:
        payload = refresh_access_token(refresh_token)
        session["access_token"] = payload["access_token"]
        session["expires_at"] = now + int(payload.get("expires_in", 3600))
        return
    
    if now >= (int(expires_at) - int(buffer_seconds)):
        payload = refresh_access_token(refresh_token)
        session["access_token"] = payload["access_token"]
        session["expires_at"] = now + int(payload.get("expires_in", 3600))


def refresh_access_token(refresh_token: str) -> dict:
    """Gets refresh token using client id and client secret."""
    client_id = os.getenv("CLIENT_ID_SPOTIFY")
    client_secret = os.getenv("CLIENT_SECRET_SPOTIFY")
    if not client_id or not client_secret:
        raise RuntimeError("Missing CLIENT_ID_SPOTIFY / CLIENT_SECRET_SPOTIFY env variables")

    basic = base64.b64encode(f"{client_id}:{client_secret}".encode("utf-8")).decode("utf-8")

    response = requests.post(
        "https://accounts.spotify.com/api/token",
        headers={
            "Authorization": f"Basic {basic}",
            "Content-Type": "application/x-www-form-urlencoded"
        },
        data={
            "grant_type": "refresh_token",
            "refresh_token": refresh_token
        },
        timeout=15
    )
    response.raise_for_status()
    return response.json()


def auth_required(f):
    """Decorate routes to require API authentication."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        is_api = request.path.startswith("/api/")
        
        if not session.get("refresh_token"):
            if is_api:
                return jsonify({"error": "auth_required"}), 401
            return redirect("/api/auth")

        try:
            ensure_token()
        except Exception:
            session.pop("access_token", None)            
            session.pop("expires_at", None)
            session.pop("refresh_token", None)
            session.pop("api_access", None)
            if is_api:
                return jsonify({"error": "auth_required"}), 401
            return redirect("/api/auth")

        return f(*args, **kwargs)
    return decorated_function