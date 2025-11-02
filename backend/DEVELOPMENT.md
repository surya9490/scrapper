# 🔥 Development Guide — Local (Node.js & Nodemon)

This guide shows you how to run the backend locally with hot reloading using Node.js watch mode or Nodemon. No Docker required.

## 🚀 Quick Start

### Option 1: Node.js Watch Mode (Recommended)

```bash
# Start API server with watch
npm run dev

# Start worker with watch
npm run dev:all   # starts API + queues via start-all.js
npm run worker:dev
```

### Option 2: Nodemon (Debugging-friendly)

```bash
# Run API with Nodemon + inspector (port 9229)
npm run dev:nodemon

# Run worker with Nodemon
npm run worker:dev
```

## 📁 Development Files

Key files relevant to local development:
- **`server.js`** — API server entrypoint
- **`start-all.js`** — Starts API, queues, and scheduled jobs
- **`worker-server.js`** — Worker entrypoint for BullMQ
- **`scraper/worker.js`** — Scrape/price monitoring job processors
- **`package.json`** — Scripts for dev/watch modes

## 🛠️ Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | API via Node.js built-in watch mode |
| `npm run dev:nodemon` | API via Nodemon + inspector (9229) |
| `npm run dev:all` | Start API + queues via `start-all.js` |
| `npm run worker` | Run worker (no watch) |
| `npm run worker:dev` | Run worker with Nodemon |
| `npm start` | Production start |

## 🔧 Development Features

### ✅ What’s Included:
- **Hot Reloading** — File changes automatically restart services
- **Debug Port** — Inspector on port 9229 when using `dev:nodemon`
- **Environment Variables** — `NODE_ENV=development` for dev scripts

### Dev Auto-Auth and Rate-Limit Bypass
- **Dev Auto-Auth**: In development, authenticated `/api` routes auto-attach an active admin user if no `Authorization` header is present. This accelerates local testing without logging in. Disabled in production.
- **Rate-Limit Bypass**: Set `RATE_LIMIT_BYPASS_KEY` and send `x-internal-api-key` header with the same value to skip rate limiting for trusted tools. Do not use this in public clients.

### 🎯 Benefits:
- **Fast Iteration** — No containers to rebuild, quick reloads
- **Easy Debugging** — Attach IDE to inspector port 9229
- **Simple Setup** — Run everything locally with Node.js

## 📋 Development Workflow

### 1. Prepare Services
- Ensure PostgreSQL and Redis are running locally
- Copy env: `cp .env.example .env` and set required values
- Initialize DB: `npx prisma migrate dev` (or `db:deploy`)

### 2. Start Servers
```bash
# API server
npm run dev      # or: npm run dev:nodemon

# Worker (queues)
npm run worker:dev
```

### 3. Test Your Changes
```bash
curl http://localhost:4000/health
curl http://localhost:4000/api/queue/status
curl -H "x-internal-api-key: $RATE_LIMIT_BYPASS_KEY" http://localhost:4000/api/queue/status
```

### 4. View Logs
- API logs appear in the same terminal
- Worker logs appear where started
- Prisma Studio: `npx prisma studio`

## 🐛 Debugging

### Enable Node.js Debugging
When using `npm run dev:nodemon`, the inspector on port 9229 is available for debugging. You can connect your IDE:

**VS Code Launch Configuration:**
```json
{
  "type": "node",
  "request": "attach",
  "name": "Attach to Node (Local)",
  "port": 9229,
  "address": "localhost",
  "localRoot": "${workspaceFolder}",
  "protocol": "inspector"
}
```

### Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Nodemon not found | `npm install --save-dev nodemon` (or use `npm run dev`) |
| Changes not detected | Use Node `--watch` (`npm run dev`) or Nodemon |
| Port conflicts | Check if port 4000 or 9229 are already in use |
| Prisma errors | Ensure `DATABASE_URL` is correct and DB reachable |

## 🔄 Alternative Approaches

### Option A: Node.js Built-in Watch Mode
```bash
npm run dev
```

### Option B: Nodemon
```bash
npm run dev:nodemon
npm run worker:dev
```

## 📊 Performance Comparison

| Method | Startup Time | Hot Reload Speed | Resource Usage |
|--------|--------------|------------------|----------------|
| Node --watch | ~3s | ~1s | Low |
| Nodemon | ~5s | ~1-2s | Low |

## 🎯 Recommendations

### For Development:
- Use **Node --watch** for minimal setup
- Use **Nodemon** for debugging with inspector

### For Production:
- Use `npm start` with proper environment variables
- Do not use watch modes or Nodemon

## 🔗 Useful Commands

```bash
# Start API server
npm run dev

# Start worker
npm run worker:dev

# Prisma
npx prisma migrate dev
npx prisma migrate deploy
npx prisma generate
npx prisma studio
```

## 🚀 Next Steps

1. **Set up your IDE** for Docker debugging
2. **Configure linting** with ESLint/Prettier
3. **Add testing** with Jest or Mocha
4. **Set up CI/CD** pipeline
5. **Add monitoring** and logging

---

Happy coding! 🎉 Your local development environment is now ready with hot reloading support.