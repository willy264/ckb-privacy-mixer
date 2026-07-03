FROM rust:1-slim AS ct-mint-helper-builder

WORKDIR /helper

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/*

COPY tools/ct-mint-helper/Cargo.toml ./
COPY tools/ct-mint-helper/src ./src

RUN cargo build --release

FROM node:20-slim

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY mixer-sdk/package.json ./mixer-sdk/
COPY backend/package.json ./backend/

RUN pnpm config set node-linker hoisted
RUN pnpm install --frozen-lockfile

COPY mixer-sdk/ ./mixer-sdk/
COPY backend/ ./backend/
COPY --from=ct-mint-helper-builder /helper/target/release/ct-mint-helper ./bin/ct-mint-helper

RUN pnpm --filter mixer-sdk build
RUN pnpm --filter ckb-mixer-backend build

ENV CT_MINT_HELPER_BIN=/app/bin/ct-mint-helper

EXPOSE 4000 4001

CMD ["node", "backend/dist/coordinator/start.js"]
