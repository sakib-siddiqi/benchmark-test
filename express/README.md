# Express.js Benchmark Server

A minimal Express.js HTTP server for benchmarking purposes.

## Setup

Install dependencies:

```bash
npm install
```

## Running

### Development mode (with TypeScript)

```bash
npm run dev
```

### Production mode

Build the TypeScript:

```bash
npm run build
```

Run the compiled JavaScript:

```bash
npm start
```

## Server Details

- **Port:** 8080
- **Endpoint:** `GET /` returns "Bun!"
- **URL:** http://localhost:8080

## Benchmarking

This server is designed as a minimal implementation for performance comparison with the Bun runtime version.
