# -*- coding: utf-8 -*-
import os
import shutil
import tempfile
import uuid
import subprocess
from pathlib import Path

from flask import Flask, render_template, request, send_file, jsonify, after_this_request

# --- Config ------------------------------------------------------------------
app = Flask(__name__)
app.config["UPLOAD_FOLDER"] = "/tmp"
# Limit uploads to ~1GB
app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024 * 1024
# Allowed file extensions (video/audio). ffmpeg can open a lot, but we'll hint here.
ALLOWED_EXTS = {
    "mp4","mkv","mov","avi","webm","m4v","flv","ts","3gp","ogg","ogv","wav","mp3","aac","m4a","flac","wma","wmv"
}

BITRATES = {
    "low": "96k",
    "medium": "192k",
    "high": "320k"
}

def allowed_file(filename: str) -> bool:
    if "." not in filename:
        return True  # let ffmpeg try anyway
    return filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTS or True

# --- Routes ------------------------------------------------------------------
@app.get("/")
def index():
    return render_template("index.html")

@app.post("/convert")
def convert():
    # Validate file
    if "file" not in request.files:
        return jsonify({"error": "Файл не получен"}), 400

    f = request.files["file"]
    if not f or f.filename == "":
        return jsonify({"error": "Файл не выбран"}), 400

    if not allowed_file(f.filename):
        return jsonify({"error": "Неподдерживаемый формат файла"}), 400

    # Output settings
    quality = request.form.get("quality", "medium").lower()
    bitrate = BITRATES.get(quality, BITRATES["medium"])
    output_name = request.form.get("output_name", "").strip()

    # Work in an isolated temp dir that will be cleaned up automatically
    temp_dir = tempfile.mkdtemp(prefix="mp3conv_")
    input_path = Path(temp_dir) / f"input_{uuid.uuid4().hex}"
    output_path = Path(temp_dir) / "output.mp3"

    f.save(input_path)

    # If output name was provided, sanitize and apply later in send_file
    def safe_filename(name: str) -> str:
        # remove extension if any and illegal characters
        name = name.rsplit(".", 1)[0]
        name = "".join(ch for ch in name if ch.isalnum() or ch in (" ", "-", "_", "."))
        name = name.strip().replace(" ", "_")
        return name or "audio"

    download_name = safe_filename(output_name) + ".mp3" if output_name else None

    # Run ffmpeg to extract audio and encode to MP3
    # Requires ffmpeg installed on the system (https://ffmpeg.org/)
    cmd = [
        "ffmpeg",
        "-y",
        "-i", str(input_path),
        "-vn",  # drop video
        "-acodec", "libmp3lame",
        "-b:a", bitrate,
        str(output_path),
    ]

    try:
        completed = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            text=True,
        )
        if completed.returncode != 0 or not output_path.exists():
            err = (completed.stderr or "")[-4000:]
            return jsonify({"error": "Ошибка конвертации. Проверьте, что установлен ffmpeg.", "details": err}), 500
    except FileNotFoundError:
        return jsonify({"error": "ffmpeg не найден. Установите ffmpeg и перезапустите сервер."}), 500
    except Exception as e:
        return jsonify({"error": "Непредвиденная ошибка", "details": str(e)}), 500

    @after_this_request
    def cleanup(response):
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception:
            pass
        return response

    # Name of downloaded file
    if not download_name:
        # Try to use original name base
        base = Path(f.filename).stem or "audio"
        download_name = safe_filename(base) + ".mp3"

    # send_file will stream the file to the browser
    return send_file(
        output_path,
        mimetype="audio/mpeg",
        as_attachment=True,
        download_name=download_name,
        max_age=0
    )

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
