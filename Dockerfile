# The API and crawler (server/), run with tsx straight from TypeScript.
#
# Built from this Dockerfile rather than Railway's default builder, which downloads its own tools
# from GitHub on every build and fails whenever those downloads time out. This needs only Docker
# Hub (the Node image) and npm. The front end is built and served by Vercel, not here.

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production

# Dependencies first, so they're cached between builds that only change code.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY tsconfig.json ./
COPY contract ./contract
COPY server ./server

# Railway sets PORT; 8787 is the local default.
EXPOSE 8787
CMD ["npm", "start"]
