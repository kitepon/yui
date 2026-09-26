# 結（Yui）本番 image。ホストで `npm run build` した .output を linux/amd64 に載せる。
# サーバーは build せず、運ばれた image を動かすだけ。
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0
ENV YUI_DATA_FILE=/data/yui.json
ENV VITE_AUTH_ENABLED=true
ENV VITE_PUBLIC_HOSTNAME=yuihome.kitepon.dev

COPY .output /app/.output
COPY package.json /app/package.json
COPY certs/apple /app/certs/apple
COPY scripts/hosted-metrics.mjs /app/scripts/hosted-metrics.mjs
COPY src/lib/home/lan-udp.ts /app/src/lib/home/lan-udp.ts
COPY src/lib/home/tuya-lan-forward.ts /app/src/lib/home/tuya-lan-forward.ts

RUN useradd --system --uid 1001 --create-home yui \
  && mkdir -p /data \
  && chown yui:yui /data

USER yui
EXPOSE 8080
CMD ["node", ".output/server/index.mjs"]
