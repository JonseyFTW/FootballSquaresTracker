# Build stage for React frontend
FROM node:20-alpine AS frontend-build

WORKDIR /app/client

# Copy client package files
COPY client/package*.json ./

# Install client dependencies
RUN npm ci

# Copy client source
COPY client/ ./

# Build the React app
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy server package files
COPY package*.json ./

# Install only production dependencies (exclude devDependencies)
RUN npm ci --omit=dev

# Copy server source
COPY server/ ./server/

# Copy built frontend from build stage
COPY --from=frontend-build /app/client/dist ./client/dist

# Create data directory
RUN mkdir -p ./server/data

# Expose port
EXPOSE 3001

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Start the server
CMD ["node", "server/index.js"]
