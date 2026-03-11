# Multi-stage Dockerfile for SWE Rust binaries
# Builds: swe-api (server), swe-cli (swe binary), swe-worker (temporal worker)

# ─── Builder ───────────────────────────────────────────────
FROM rust:1.94-bookworm AS builder

WORKDIR /build

# Cache dependencies by building a dummy project first
COPY Cargo.toml Cargo.lock* ./
COPY crates/swe-core/Cargo.toml crates/swe-core/Cargo.toml
COPY crates/swe-temporal/Cargo.toml crates/swe-temporal/Cargo.toml
COPY crates/swe-api/Cargo.toml crates/swe-api/Cargo.toml
COPY crates/swe-cli/Cargo.toml crates/swe-cli/Cargo.toml
COPY crates/swe-sandbox/Cargo.toml crates/swe-sandbox/Cargo.toml

# Create dummy source files for dependency caching
RUN mkdir -p crates/swe-core/src && echo "pub fn _dummy() {}" > crates/swe-core/src/lib.rs && \
    mkdir -p crates/swe-temporal/src && echo "pub fn _dummy() {}" > crates/swe-temporal/src/lib.rs && \
    mkdir -p crates/swe-api/src && echo "pub fn _dummy() {}" > crates/swe-api/src/lib.rs && \
    mkdir -p crates/swe-cli/src && echo "fn main() {}" > crates/swe-cli/src/main.rs && \
    mkdir -p crates/swe-sandbox/src && echo "pub fn _dummy() {}" > crates/swe-sandbox/src/lib.rs

RUN cargo build --release 2>/dev/null || true

# Copy actual source code
COPY crates/ crates/
COPY proto/ proto/

# Build all binaries
RUN cargo build --release

# ─── API Server Runtime ────────────────────────────────────
FROM debian:bookworm-slim AS api

RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/target/release/swe-api /usr/local/bin/swe-api

ENV RUST_LOG=info
EXPOSE 8080

CMD ["swe-api"]

# ─── CLI Runtime ───────────────────────────────────────────
FROM debian:bookworm-slim AS cli

RUN apt-get update && apt-get install -y ca-certificates git curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/target/release/swe /usr/local/bin/swe

CMD ["swe", "--help"]

# ─── Worker Runtime ────────────────────────────────────────
FROM debian:bookworm-slim AS worker

RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/target/release/swe-worker /usr/local/bin/swe-worker

ENV RUST_LOG=info

CMD ["swe-worker"]
