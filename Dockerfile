FROM node:20-slim

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10

# Copy workspace config files first (for caching)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY mixer-sdk/package.json ./mixer-sdk/
COPY backend/package.json ./backend/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY mixer-sdk/ ./mixer-sdk/
COPY backend/ ./backend/

# Build
RUN pnpm --filter mixer-sdk build
RUN pnpm --filter ckb-mixer-backend build

EXPOSE 3000

CMD ["node", "--input-type=module", "-e", "import('./backend/dist/coordinator/server.js').then(({createCoordinatorServer})=>{const port=process.env.PORT||4001;createCoordinatorServer().listen(port,'0.0.0.0',()=>console.log('Coordinator on '+port));})"]