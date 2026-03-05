install:
	pip install -r requirements-dev.txt

run:
	uvicorn app.main:app --reload

worker:
	python -m app.worker

test:
	pytest -q

lint:
	ruff check .

format:
	ruff format .

migrate:
	alembic upgrade head

migrate-down:
	alembic downgrade -1

migrate-bootstrap:
	python scripts/migrate_or_stamp.py

new-migration:
	@[ -n "$(MSG)" ] || (echo "Usage: make new-migration MSG='add new table'" && exit 1)
	alembic revision --autogenerate -m "$(MSG)"

tts-setup:
	python scripts/setup_tts.py

tts-bench:
	python scripts/benchmark_tts.py
