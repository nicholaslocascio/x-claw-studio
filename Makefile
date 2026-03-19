SHELL := /bin/bash

CHROMA_CONTAINER ?= twitter-trend-chroma
CHROMA_URL ?= http://localhost:8000

.PHONY: help install dev build check lint test test-unit test-integration test-e2e test-all \
	up up-dev stack scheduler daily-poll \
	chroma-up chroma-down chroma-logs chroma-heartbeat \
	test-live-gemini test-live-chroma test-live-integration test-live-e2e live-all

help:
	@printf "%s\n" \
	"install                npm install" \
	"dev                    run Next app locally" \
	"build                  production build" \
	"check                  TypeScript check" \
	"lint                   eslint" \
	"test / test-unit       unit tests" \
	"test-integration       integration test suite (flags/env decide what runs)" \
	"test-e2e               e2e test suite (flags/env decide what runs)" \
	"test-all               check + build + unit tests" \
	"up-dev / dev           run Next.js dev server locally" \
	"up / stack             run full local stack with auto-restart (production Next + scheduler + Chroma)" \
	"scheduler              run scheduler polling loop" \
	"daily-poll             start Chroma and run daily scheduler polling loop" \
	"chroma-up              start local Chroma on localhost:8000" \
	"chroma-down            stop/remove local Chroma container" \
	"chroma-logs            tail Chroma logs" \
	"chroma-heartbeat       verify Chroma is reachable" \
	"test-live-gemini       real Gemini integration test" \
	"test-live-chroma       real Chroma integration test" \
	"test-live-integration  real Gemini + Chroma integration test" \
	"test-live-e2e          full live end-to-end pipeline test" \
	"live-all               all live tests, with Chroma lifecycle"

install:
	npm install

dev:
	npm run dev

build:
	npm run build

check:
	npm run check

lint:
	npm run lint

test: test-unit

test-unit:
	npm test

test-integration:
	npm run test:integration

test-e2e:
	npm run test:e2e

test-all: check build test-unit

up: stack

up-dev: dev

stack:
	npm run stack

scheduler:
	npm run scheduler

daily-poll: chroma-up
	CHROMA_URL=$(CHROMA_URL) npm run scheduler

chroma-up:
	@docker rm -f $(CHROMA_CONTAINER) >/dev/null 2>&1 || true
	docker run -d --name $(CHROMA_CONTAINER) -p 8000:8000 chromadb/chroma:latest
	@$(MAKE) chroma-heartbeat

chroma-down:
	@docker rm -f $(CHROMA_CONTAINER) >/dev/null 2>&1 || true

chroma-logs:
	docker logs -f $(CHROMA_CONTAINER)

chroma-heartbeat:
	curl -fsS $(CHROMA_URL)/api/v2/heartbeat || curl -fsS $(CHROMA_URL)/api/v1/heartbeat

test-live-gemini:
	LIVE_GEMINI_TESTS=1 npm run test:integration -- tests/integration/gemini.live.test.ts

test-live-chroma:
	LIVE_CHROMA_TESTS=1 CHROMA_URL=$(CHROMA_URL) npm run test:integration -- tests/integration/chroma.live.test.ts

test-live-integration:
	LIVE_INTEGRATION_TESTS=1 CHROMA_URL=$(CHROMA_URL) npm run test:integration -- tests/integration/analysis-index.live.test.ts

test-live-e2e:
	LIVE_E2E_TESTS=1 CHROMA_URL=$(CHROMA_URL) npm run test:e2e

live-all: chroma-up test-live-gemini test-live-chroma test-live-integration test-live-e2e
