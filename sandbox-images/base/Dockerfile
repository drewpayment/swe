# SWE Sandbox Base Image
# Common tools available to all agent types

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    git \
    curl \
    wget \
    jq \
    ca-certificates \
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

# Create workspace directory
RUN mkdir -p /workspace
WORKDIR /workspace

# Non-root user for sandbox execution
RUN useradd -m -s /bin/bash swe-agent
USER swe-agent

ENV SWE_SANDBOX=true
