FROM node:22-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV="production"

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps ./apps
COPY packages ./packages
COPY services ./services
COPY scripts ./scripts
COPY tsconfig.base.json tsconfig.json vitest.shared.config.ts ./

RUN pnpm install --frozen-lockfile

RUN chown -R node:node /app /pnpm
USER node

CMD ["sh", "-c", "if [ \"$SERVICE_ROLE\" = \"indexer\" ]; then exec pnpm --filter @memecoin/indexer exec tsx src/index.ts; elif [ \"$SERVICE_ROLE\" = \"processor\" ]; then exec pnpm --filter @memecoin/processor exec tsx src/index.ts; elif [ \"$SERVICE_ROLE\" = \"alerts\" ]; then exec pnpm --filter @memecoin/alerts exec tsx src/index.ts; else pnpm --filter @memecoin/api exec tsx /app/packages/database/src/migrate.ts && exec pnpm --filter @memecoin/api exec tsx src/index.ts; fi"]
