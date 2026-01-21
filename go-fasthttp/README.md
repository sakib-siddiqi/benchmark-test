# Go FastHTTP Benchmark Server

A minimal Go HTTP server using the fasthttp package for benchmarking purposes.

## Setup

Install dependencies:

```bash
go mod download
```

## Running

### Development mode

```bash
go run main.go
```

### Production mode

Build the binary:

```bash
go build -o server
```

Run the binary:

```bash
./server
```

## Server Details

- **Port:** 8080
- **Root Endpoint:** `GET /` returns "Go!"
- **Static Files:** Any file in `public/` directory is accessible at `/<filename>`
- **URL:** http://localhost:8080

## Benchmarking

This server is designed as a minimal implementation for performance comparison with Bun and Express versions using the high-performance fasthttp package.

## Package

Uses `github.com/valyala/fasthttp` - a fast HTTP implementation for Go that can be up to 10x faster than net/http.
