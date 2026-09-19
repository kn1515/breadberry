.PHONY: setup dev build test docker deploy
setup:
	npm ci
dev:
	npm run dev
build:
	npm run build
test:
	npm run typecheck
	npm test
	npm run test:e2e
docker:
	docker compose up --build
deploy:
	./scripts/deploy.sh
