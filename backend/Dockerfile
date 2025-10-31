# Use Playwright base image (includes browsers) - specific version to match dependencies
FROM mcr.microsoft.com/playwright:v1.56.1-jammy

# Switch to root for package installation
USER root

WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev && npm cache clean --force

# Copy rest of the project files
COPY . .

# Generate Prisma client with proper binary targets
RUN npx prisma generate

# Change ownership of the app directory for the Playwright user
RUN chown -R pwuser:pwuser /app

# Expose backend port
EXPOSE 4000

# Switch back to non-root user
USER pwuser

# Start the backend
CMD ["node", "server.js"]
