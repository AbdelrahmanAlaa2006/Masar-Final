# Masaar Platform — Locust Load Testing & Resilience Suite

This directory contains a realistic performance, scalability, API abuse, and DoS-resilience test suite built specifically for the Masaar platform using [Locust](https://locust.io/).

## Requirements

- Python 3.10+
- Locust 2.20+
- `requests`, `python-dotenv`

Install dependencies:
```bash
pip install -r requirements.txt
```

## Environment Variables

- `VITE_SUPABASE_URL`: Target Supabase Project URL (e.g. `https://zphnjirmcrolqjrhjjqt.supabase.co`)
- `VITE_SUPABASE_ANON_KEY`: Target Supabase Anonymous JWT Key

## Execution Scenarios

### 1. Headless Progressive Load Test (Baseline to Peak Users)
Run a controlled load test with 10 to 100 concurrent users:
```bash
locust -f locustfile.py --headless -u 50 -r 5 --run-time 1m --host https://zphnjirmcrolqjrhjjqt.supabase.co
```

### 2. Multi-Tenant Fairness Test
Run 100 concurrent users across multiple tenant namespaces:
```bash
locust -f locustfile.py --headless -u 100 -r 10 --run-time 2m
```

### 3. Interactive Web UI
Launch the Locust Web UI at `http://localhost:8089`:
```bash
locust -f locustfile.py
```
