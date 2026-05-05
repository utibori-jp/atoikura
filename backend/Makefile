.PHONY: migrate-up sqlc-gen run

migrate-up:
	bash scripts/migrate.sh

sqlc-gen:
	sqlc generate

run:
	go run ./cmd/server
