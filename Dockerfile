FROM python:3.10-slim

# Install system dependencies (ffmpeg is essential for yt-dlp video/audio merging)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency requirements first to leverage Docker caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY app.py .
COPY static/ ./static/

# Create downloads folder for runtime operations
RUN mkdir -p downloads

# Render passes the port in $PORT environment variable
ENV PORT=8000
EXPOSE 8000

# Launch Uvicorn server bound to 0.0.0.0 and dynamically assigned $PORT
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}"]
