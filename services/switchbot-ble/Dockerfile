# ホストの bluetoothd に dbus で話して SwitchBot Bot を押す。
FROM python:3.12.15-slim-bookworm@sha256:6a0e06f5ba0b373d051aabd3fffb9b873f27f9a2a3a14bcbe37dee6f0e3bbc70
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates=20250419~deb12u2 \
    && rm -rf /var/lib/apt/lists/*
COPY verify_trust_store.py .
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && python -m pip uninstall --yes pip
RUN python verify_trust_store.py
COPY server.py .
ENV SWITCHBOT_BLE_BIND=127.0.0.1
ENV SWITCHBOT_BLE_PORT=18862
EXPOSE 18862
CMD ["python", "server.py"]
