.PHONY: run dev test lint verify

run:
	python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

dev:
	python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

test:
	pytest

lint:
	ruff check .

verify:
	python scripts/verify.py
