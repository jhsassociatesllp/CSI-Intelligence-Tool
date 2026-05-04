FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Prevent Python buffering
ENV PYTHONUNBUFFERED=1

# Install system deps (optional but safe)
RUN apt-get update && apt-get install -y gcc && rm -rf /var/lib/apt/lists/*

# Copy requirements first (cache optimization)
COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

# Copy app code
COPY . .

# Default port (can be overridden)
ENV APP_PORT=9040

# Expose dynamic port
EXPOSE ${APP_PORT}

# Run FastAPI
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${APP_PORT}"]