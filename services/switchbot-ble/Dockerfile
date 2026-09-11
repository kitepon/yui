# ホストの bluetoothd に dbus で話して SwitchBot Bot を押す。
FROM python:3.12-slim-bookworm
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py .
ENV SWITCHBOT_BLE_BIND=127.0.0.1
ENV SWITCHBOT_BLE_PORT=18862
EXPOSE 18862
CMD ["python", "server.py"]
