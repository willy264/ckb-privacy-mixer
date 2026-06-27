# Install TypeScript globally so tsc is available
RUN npm install -g pnpm@10 typescript

# Build mixer-sdk explicitly with tsc
RUN cd mixer-sdk && tsc

# Then build backend
RUN pnpm --filter ckb-mixer-backend build