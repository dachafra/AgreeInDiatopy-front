# syntax=docker/dockerfile:1
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    STANZA_RESOURCES_DIR=/opt/stanza_resources \
    STANZA_ALLOW_DOWNLOAD=0 \
    AGREEINDIATOPY_PRELOAD_MODEL=1 \
    HOST=0.0.0.0 \
    PORT=8000

WORKDIR /app

RUN apt-get update \
    && apt-get install --yes --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-deploy.txt ./
RUN pip install --requirement requirements-deploy.txt

COPY subject_verb_extractor ./subject_verb_extractor
COPY download_models.py ./

# This is intentionally part of the build. A failed model download must make
# the image build fail instead of producing a container that needs Internet.
RUN python download_models.py \
    && python -c "from subject_verb_extractor.parse import preload_stanza_pipeline; preload_stanza_pipeline()"

COPY web ./web
COPY web_server.py ./

RUN useradd --create-home --uid 10001 app \
    && chown -R app:app /app /opt/stanza_resources
USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3)"

CMD ["python", "web_server.py"]
