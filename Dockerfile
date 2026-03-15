# Multi-stage Dockerfile for SWE Go binaries
# Builds: swe-api (server), swe (CLI), swe-worker (temporal worker)

# ─── Builder ───────────────────────────────────────────────
FROM golang:1.25-bookworm AS builder

WORKDIR /build

# Cache dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY cmd/ cmd/
COPY internal/ internal/

# Build all binaries
RUN CGO_ENABLED=0 go build -o /out/swe-api ./cmd/api/
RUN CGO_ENABLED=0 go build -o /out/swe-worker ./cmd/worker/
RUN CGO_ENABLED=0 go build -o /out/swe ./cmd/cli/

# ─── API Server Runtime ────────────────────────────────────
FROM debian:bookworm-slim AS api

RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /out/swe-api /usr/local/bin/swe-api

EXPOSE 8080

CMD ["swe-api"]

# ─── CLI Runtime ───────────────────────────────────────────
FROM debian:bookworm-slim AS cli

RUN apt-get update && apt-get install -y ca-certificates git curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /out/swe /usr/local/bin/swe

CMD ["swe", "--help"]

# ─── Worker Runtime ────────────────────────────────────────
FROM debian:bookworm-slim AS worker

RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /out/swe-worker /usr/local/bin/swe-worker

CMD ["swe-worker"]
