FROM node:22-alpine

WORKDIR /app

# Install dependencies first (layer-cached unless package.json changes)
COPY package*.json ./
RUN npm ci

# Copy source (hot-reload via volume mount in dev, so this is only for the image layer)
COPY . .

EXPOSE 5173

# --host 0.0.0.0 makes Vite listen on all interfaces inside the container
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
