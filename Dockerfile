FROM node:20-slim

WORKDIR /app

RUN npm install -g pnpm@10 typescript

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY mixer-sdk/package.json ./mixer-sdk/
COPY backend/package.json ./backend/

RUN pnpm install --frozen-lockfile

COPY mixer-sdk/ ./mixer-sdk/
COPY backend/ ./backend/

RUN cd mixer-sdk && tsc
RUN pnpm --filter ckb-mixer-backend build

EXPOSE 3000

CMD ["node", "--input-type=module", "-e", "import('./backend/dist/coordinator/server.js').then(({createCoordinatorServer})=>{const port=process.env.PORT||4001;createCoordinatorServer().listen(port,'0.0.0.0',()=>console.log('Coordinator on '+port));})"]
