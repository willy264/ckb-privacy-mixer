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

RUN pnpm --filter mixer-sdk build
RUN pnpm --filter ckb-mixer-backend build

EXPOSE 4000 4001

CMD ["node", "--input-type=module", "-e", "import('./backend/dist/coordinator/server.js').then(({createCoordinatorServer})=>{const port=process.env.PORT||4001;createCoordinatorServer().listen(port,'0.0.0.0',()=>console.log('Coordinator on '+port));})"]
