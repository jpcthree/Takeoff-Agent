FROM python:3.12-slim

WORKDIR /app

# Copy the entire project (we need scripts and config)
COPY . /app

# Install dependencies
RUN pip install --no-cache-dir -r takeoff-api/requirements.txt

# Set environment variables
ENV PYTHONPATH=/app/.claude/skills/takeoff/scripts:/app
ENV PORT=8000

# Expose port
EXPOSE 8000

# Run from the takeoff-api directory
WORKDIR /app/takeoff-api

# Use shell form so $PORT is expanded at runtime
CMD uvicorn main:app --host 0.0.0.0 --port $PORT
