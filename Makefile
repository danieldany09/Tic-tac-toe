###############################################################################
# Makefile – convenience targets for the TicTacToe Nakama backend
###############################################################################

.PHONY: install build typecheck dev stop restart logs shell-nakama shell-db clean deploy test-install test test-validation test-player-left test-all web-install web-build web-dev

# ── TypeScript module ──────────────────────────────────────────────────────────

install:
	cd backend && npm install

build: install
	cd backend && npm run build

typecheck: install
	cd backend && npm run typecheck

watch: install
	cd backend && npm run watch

# ── Local development ──────────────────────────────────────────────────────────

dev: build
	docker compose up -d
	@echo ""
	@echo "  Nakama console  →  http://localhost:7351"
	@echo "  API / WebSocket →  http://localhost:7350"
	@echo ""

stop:
	docker compose down

restart: build
	docker compose restart nakama

logs:
	docker compose logs -f nakama

logs-db:
	docker compose logs -f postgres

shell-nakama:
	docker compose exec nakama /bin/sh

shell-db:
	docker compose exec postgres psql -U postgres -d nakama

# ── Production deployment ──────────────────────────────────────────────────────

deploy: build
	docker compose -f docker-compose.prod.yml --env-file .env up -d --remove-orphans
	@echo "Production stack started."

deploy-stop:
	docker compose -f docker-compose.prod.yml --env-file .env down

deploy-logs:
	docker compose -f docker-compose.prod.yml --env-file .env logs -f nakama

# ── Testing ───────────────────────────────────────────────────────────────────

test-install:
	cd test && npm install

test: test-install
	@echo "Running integration tests (full game)..."
	cd test && npm test

test-validation: test-install
	@echo "Running move validation tests..."
	cd test && npm run test:validation

test-player-left: test-install
	@echo "Running PLAYER_LEFT disconnect test..."
	cd test && npm run test:player-left

test-all: test test-validation test-player-left

# ── Cleanup ────────────────────────────────────────────────────────────────────

clean:
	docker compose down -v
	rm -f nakama-data/modules/index.js
	@echo "Cleaned up containers, volumes, and built module."

# ── Web client ────────────────────────────────────────────────────────────────

web-install:
	cd web && npm install

web-build: web-install
	cd web && npm run build

web-dev: web-install
	cd web && npm run dev
