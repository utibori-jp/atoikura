.PHONY: logs

# Stream production-style compose-service logs (backend/frontend) live.
# Override SERVICES to filter, e.g.: make logs SERVICES=backend
SERVICES ?= backend frontend

logs:
	docker compose logs -f --tail=100 $(SERVICES)
