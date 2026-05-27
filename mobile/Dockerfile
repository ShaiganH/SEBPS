FROM node:22-alpine

WORKDIR /app

# Install dependencies first (layer-cached unless package.json changes)
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# Copy source (hot-reload via volume mount in dev)
COPY . .

# Metro bundler + Expo DevTools
EXPOSE 8081 19000 19001

# Tell Expo to listen on all interfaces so the host can reach it
ENV EXPO_DEVTOOLS_LISTEN_ADDRESS=0.0.0.0

# --host lan makes Metro advertise REACT_NATIVE_PACKAGER_HOSTNAME to phones
CMD ["npx", "expo", "start", "--host", "lan"]
