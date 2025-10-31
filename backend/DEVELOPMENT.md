# 🔥 Development Guide - Nodemon with Docker

This guide shows you how to run nodemon along with Docker for hot reloading during development.

## 🚀 Quick Start

### Option 1: Development Mode with Nodemon (Recommended)

```bash
# Start development environment with hot reloading
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# Or run in background
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build

# Watch logs
docker compose logs -f backend worker
```

### Option 2: Production Mode (No Hot Reloading)

```bash
# Standard production setup
docker compose up -d

# Watch logs
docker compose logs -f backend worker
```

## 📁 Development Files

### New Files Added:
- **`Dockerfile.dev`** - Development Dockerfile with dev dependencies
- **`docker-compose.dev.yml`** - Development override configuration
- **`DEVELOPMENT.md`** - This guide

### Updated Files:
- **`package.json`** - Added nodemon scripts
- **`docker-commands.md`** - Added development commands section

## 🛠️ Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev:nodemon` | Run backend with nodemon |
| `npm run worker:dev` | Run worker with nodemon |
| `npm run dev` | Run with Node.js built-in watch mode |
| `npm start` | Production start |

## 🔧 Development Features

### ✅ What Works:
- **Hot Reloading** - File changes automatically restart services
- **Volume Mounting** - Your local code is mounted into containers
- **Debug Port** - Port 9229 exposed for debugging
- **Development Dependencies** - Nodemon and other dev tools available
- **Environment Variables** - `NODE_ENV=development` set automatically

### 🎯 Benefits:
- **Fast Development** - No need to rebuild containers for code changes
- **Consistent Environment** - Same Docker environment as production
- **Easy Debugging** - Debug port available for IDE integration
- **Isolated Dependencies** - Dev dependencies only in development containers

## 📋 Development Workflow

### 1. Start Development Environment
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

### 2. Make Code Changes
- Edit any `.js` file in your project
- Nodemon will automatically detect changes
- Services restart automatically

### 3. View Logs
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f backend
docker compose logs -f worker
```

### 4. Test Your Changes
```bash
curl http://localhost:4000/health
curl http://localhost:4000/api/scrape
curl http://localhost:4000/api/queue/status
```

### 5. Stop Development Environment
```bash
docker compose down
```

## 🐛 Debugging

### Enable Node.js Debugging
The development setup exposes port 9229 for debugging. You can connect your IDE:

**VS Code Launch Configuration:**
```json
{
  "type": "node",
  "request": "attach",
  "name": "Docker: Attach to Node",
  "port": 9229,
  "address": "localhost",
  "localRoot": "${workspaceFolder}",
  "remoteRoot": "/app",
  "protocol": "inspector"
}
```

### Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Nodemon not found | Use `docker-compose.dev.yml` which includes dev dependencies |
| Changes not detected | Ensure volume mounting is working: `- .:/app` |
| Port conflicts | Check if port 4000 or 9229 are already in use |
| Permission errors | Rebuild with `--no-cache` flag |

## 🔄 Alternative Approaches

### Option A: Nodemon Inside Container (Current Setup)
- ✅ Consistent environment
- ✅ Easy to share with team
- ✅ Production-like setup
- ❌ Slightly slower startup

### Option B: Nodemon on Host Machine
```bash
# Install nodemon globally on your machine
npm install -g nodemon

# Start only database services
docker compose up -d db redis

# Run backend locally with nodemon
nodemon server.js

# Run worker locally
nodemon scraper/worker.js
```

### Option C: Node.js Built-in Watch Mode
```bash
# Use Node.js --watch flag (Node 18.11+)
npm run dev
```

## 📊 Performance Comparison

| Method | Startup Time | Hot Reload Speed | Resource Usage |
|--------|--------------|------------------|----------------|
| Docker + Nodemon | ~30s | ~2-3s | Medium |
| Local Nodemon | ~5s | ~1-2s | Low |
| Node --watch | ~3s | ~1s | Low |
| Docker Production | ~25s | No reload | Medium |

## 🎯 Recommendations

### For Development:
- Use **Docker + Nodemon** for team consistency
- Use **Local Nodemon** for fastest iteration
- Use **Node --watch** for minimal setup

### For Production:
- Always use standard Docker setup
- Never include dev dependencies
- Use proper environment variables

## 🔗 Useful Commands

```bash
# Quick development start
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build

# Watch all logs
docker compose logs -f

# Restart specific service
docker compose restart backend

# Access container shell
docker compose exec backend bash

# Check container status
docker compose ps

# Stop everything
docker compose down
```

## 🚀 Next Steps

1. **Set up your IDE** for Docker debugging
2. **Configure linting** with ESLint/Prettier
3. **Add testing** with Jest or Mocha
4. **Set up CI/CD** pipeline
5. **Add monitoring** and logging

---

Happy coding! 🎉 Your development environment is now ready with hot reloading support.