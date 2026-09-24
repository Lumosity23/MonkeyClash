# MonkeyClash tribe server (Node runs the TypeScript sources directly)
FROM node:24.11.0-alpine3.22
WORKDIR /app
ENV NODE_ENV=production

COPY tribe-server/package.json ./
# dev dependencies use the pnpm workspace protocol that npm can't read, drop them
RUN node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json'));delete p.devDependencies;fs.writeFileSync('package.json',JSON.stringify(p))" && \
    npm install --omit=dev --no-audit --no-fund
COPY tribe-server/src src

USER node
EXPOSE 3005
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3005/health || exit 1
CMD ["node", "src/index.ts"]
