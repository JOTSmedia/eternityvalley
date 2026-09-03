# Somewhere Over the Rainbow Bridge — production container
# Build:  docker build -t rainbow-bridge .
# Run:    docker run -p 4242:4242 --env-file server/.env rainbow-bridge
FROM node:20-alpine
WORKDIR /app
COPY server/package*.json server/
RUN cd server && npm ci --omit=dev --omit=optional
COPY . .
ENV NODE_ENV=production
EXPOSE 4242
CMD ["node", "server/server.js"]
