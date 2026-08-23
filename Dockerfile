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
COPY scripts/hosted-metrics.mjs /app/scripts/hosted-metrics.mjs

RUN useradd --system --uid 1001 --create-home yui \
  && mkdir -p /data \
  && chown yui:yui /data

USER yui
EXPOSE 8080
CMD ["node", ".output/server/index.mjs"]
