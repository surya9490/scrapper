Perfect 🔥 Surya — here’s your ready-to-drop **`DOCKER-COMMANDS.md`** file.
Save this at the root of your project (e.g., `scrapper-backend/DOCKER-COMMANDS.md`).
It’s formatted for quick reference inside VS Code or GitHub 👇

---

# 🐳 Docker Commands — Product Mapping Backend

A quick reference for managing your **backend + Postgres + Redis + Playwright** stack.

---

## 🧱 1️⃣ Build & Setup

| Command                           | Description                                            |
| --------------------------------- | ------------------------------------------------------ |
| `docker compose up -d`            | Start all containers in background                     |
| `docker compose up`               | Start containers and show logs live                    |
| `docker compose down`             | Stop and remove containers + network (keep DB data)    |
| `docker compose down -v`          | Stop, remove containers + **delete volumes (DB data)** |
| `docker compose build`            | Build all images (using cache)                         |
| `docker compose build --no-cache` | Rebuild all containers **from scratch**                |
| `docker compose restart`          | Restart all running services                           |
| `docker compose pull`             | Pull latest base images (Playwright, Postgres, etc.)   |

---

## 🧠 2️⃣ Container Management

| Command                                 | Description                               |
| --------------------------------------- | ----------------------------------------- |
| `docker ps`                             | List running containers                   |
| `docker ps -a`                          | List all containers (running + stopped)   |
| `docker start <container_name>`         | Start a stopped container                 |
| `docker stop <container_name>`          | Stop a running container                  |
| `docker restart <container_name>`       | Restart a specific container              |
| `docker rm <container_name>`            | Remove a stopped container                |
| `docker exec -it <container_name> bash` | Open bash shell inside container          |
| `docker top <container_name>`           | Show running processes inside container   |
| `docker stats`                          | Live CPU & memory usage of all containers |

cd scrapper-backedn && docker-compose exec backend npx prisma migrate deploy 
docker-compose restart backend 
---

## 🧾 3️⃣ Logs & Debugging

| Command                           | Description                                |
| --------------------------------- | ------------------------------------------ |
| `docker compose logs`             | Show logs for all services                 |
| `docker compose logs -f`          | Follow logs in real time                   |
| `docker compose logs backend`     | Logs for backend only                      |
| `docker logs <container_name>`    | Logs of a single container                 |
| `docker logs -f <container_name>` | Follow a single container’s logs live      |
| `docker inspect <container_name>` | Detailed container info (ports, env, etc.) |

---

## 🧩 4️⃣ Database & Prisma

| Command                                                 | Description                                  |
| ------------------------------------------------------- | -------------------------------------------- |
| `docker compose exec backend npx prisma migrate deploy` | Apply DB migrations inside backend container |
| `docker compose exec backend npx prisma studio`         | Open Prisma GUI (browser-based DB viewer)    |
| `docker compose exec backend bash`                      | Access backend container shell               |
| `docker compose exec postgres psql -U postgres`         | Open Postgres CLI inside DB container        |
| `docker compose exec backend cat .env`                  | View environment variables inside container  |

---

## ⚙️ 5️⃣ Images & Volumes

| Command                          | Description                                                    |
| -------------------------------- | -------------------------------------------------------------- |
| `docker images`                  | List all Docker images                                         |
| `docker rmi <image_id>`          | Delete specific image                                          |
| `docker image prune -f`          | Remove unused images                                           |
| `docker volume ls`               | List all volumes                                               |
| `docker volume rm <volume_name>` | Delete a specific volume                                       |
| `docker system prune -a`         | ⚠️ Delete all unused containers, images, and volumes (cleanup) |

---

## 🔥 6️⃣ Development with Nodemon

| Command                                                    | Description                                      |
| ---------------------------------------------------------- | ------------------------------------------------ |
| `docker compose -f docker-compose.yml -f docker-compose.dev.yml up` | Start with nodemon for hot reloading |
| `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d` | Start dev mode in background |
| `docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f backend` | Watch backend logs with nodemon |
| `docker compose -f docker-compose.yml -f docker-compose.dev.yml restart backend` | Restart backend in dev mode |
| `npm run dev:nodemon` (inside container)                   | Run nodemon directly inside container            |
| `npm run worker:dev` (inside container)                    | Run worker with nodemon                          |

### Quick Dev Setup:
```bash
# Start development environment with hot reloading
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Watch logs
docker compose logs -f backend worker

# Your code changes will automatically restart the services!
```

---

## 🧠 7️⃣ Dev Shortcuts

| Task                         | Command                                             |
| ---------------------------- | --------------------------------------------------- |
| Rebuild backend only         | `docker compose build backend --no-cache`           |
| Restart backend only         | `docker compose restart backend`                    |
| Watch backend logs           | `docker compose logs -f backend`                    |
| Open backend terminal        | `docker compose exec backend bash`                  |
| Test backend health          | `curl http://localhost:4000/health`                 |
| Restart Postgres only        | `docker compose restart postgres`                   |
| Connect to Postgres manually | `docker compose exec postgres psql -U postgres`     |
| Show ports in use            | `docker ps --format "table {{.Names}}\t{{.Ports}}"` |

---

## 🧩 8️⃣ Debug & Fix Issues

| Issue                                    | Fix                                                |
| ---------------------------------------- | -------------------------------------------------- |
| Container keeps restarting               | `docker compose logs -f backend`                   |
| Permission denied errors                 | Rebuild with `--no-cache`                          |
| Postgres not ready before backend starts | Add `depends_on` with `condition: service_healthy` |
| Disk space full                          | `docker system prune -a`                           |
| Port already in use                      | `lsof -i :4000` → `kill -9 <PID>`                  |

---

## 🧭 9️⃣ Typical Workflow

```bash
# Start stack
docker compose up -d

# Check containers
docker ps

# Apply Prisma migrations
docker compose exec backend npx prisma migrate deploy

# View backend logs
docker compose logs -f backend

# Test API
curl http://localhost:4000/health

# Stop stack
docker compose down
```

---

## 📊 🔟 Monitoring

| Command                          | Description                         |                           |
| -------------------------------- | ----------------------------------- | ------------------------- |
| `docker stats`                   | Live resource usage per container   |                           |
| `docker system df`               | Check total Docker disk usage       |                           |
| `docker inspect <container_name> | grep IPAddress`                     | Get internal container IP |
| `docker compose ps`              | See service names and port mappings |                           |

---

## 💡 Pro Tip

When in doubt:

```bash
docker compose logs -f backend
```

That’s your best friend — it tells you exactly what’s happening inside your backend container.

---

Would you like me to include this file in `.mdx` format too (for rendering in your future Remix/Docs dashboard)?
