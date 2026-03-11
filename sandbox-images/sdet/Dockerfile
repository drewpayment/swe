# SWE Sandbox SDET Image
# For test agents that need test frameworks and runners

FROM ghcr.io/drewpayment/swe-sandbox-coder:latest

USER root

# Test frameworks and runners
RUN npm install -g \
    jest \
    vitest \
    playwright \
    cypress \
    @testing-library/dom

# Python test tools
RUN pip3 install --break-system-packages \
    pytest \
    pytest-cov \
    pytest-asyncio \
    coverage \
    hypothesis

# Rust test tools
RUN cargo install cargo-tarpaulin cargo-nextest 2>/dev/null || true

# Browser dependencies for Playwright
RUN npx playwright install-deps 2>/dev/null || true

USER swe-agent
WORKDIR /workspace
