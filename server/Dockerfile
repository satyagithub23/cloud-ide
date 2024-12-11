# Stage 1: Build stage
FROM node:18-alpine AS build

# Install build dependencies including bash and Chromium
RUN apk add --no-cache python3 make g++ bash chromium

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm install --production \
    && npm cache clean --force \
    && rm -rf /tmp/*

# Stage 2: Production stage
FROM node:18-alpine

# Install bash and Chromium in the production stage
RUN apk add --no-cache bash chromium

# Set working directory
WORKDIR /app

# Ensure the user directory exists
RUN mkdir -p /app/user

# Copy built files from the previous stage
COPY --from=build /app/node_modules ./node_modules
COPY index.js index.js
COPY user user

# Set the necessary environment variables for Puppeteer to find Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Expose the port
EXPOSE 9000

# Command to run the application
CMD ["node", "index.js"]
