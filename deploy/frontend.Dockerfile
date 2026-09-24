# MonkeyClash site: the Monkeytype frontend with Tribe enabled, served by nginx
FROM node:24.11.0-alpine3.22 AS builder
WORKDIR /app

# public URL of the site, e.g. https://monkeyclash.assistantstudent.com
ARG SITE_URL
# the backend is proxied under /api, the tribe server under /socket.io on the same origin
ENV BACKEND_URL=${SITE_URL}/api FORCE_TRIBE=true TRIBE_URL="" RECAPTCHA_SITE_KEY=""

COPY ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "turbo.json", "./"]
COPY packages packages
COPY frontend frontend
COPY docker/frontend/firebase-config-live.ts frontend/src/ts/constants/firebase-config.ts
COPY docker/frontend/firebase-config-live.ts frontend/src/ts/constants/firebase-config-live.ts

RUN npm i -g pnpm@10.28.1 && \
    pnpm i --frozen-lockfile && \
    npm run build

FROM nginx:mainline-alpine
COPY --from=builder /app/frontend/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
