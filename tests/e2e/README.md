# UI end-to-end tests (Selenium)

These are **smoke tests** only: they verify the SPA shell loads on `/login` and `/register`.

## Prerequisites

- A running stack (e.g. `docker compose up --build` from repo root — UI on port **3000** by default).
- Python **3.11+**.

## Install

```bash
cd tests/e2e
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Run

```bash
export BASE_URL=http://localhost:3000
pytest -q
```

Skip without running the browser:

```bash
SKIP_E2E=1 pytest -q
```

**Note:** Chrome/Chromium must be installed locally; `webdriver-manager` downloads a matching ChromeDriver. GitHub Actions installs Chromium-compatible deps on `ubuntu-latest`.
