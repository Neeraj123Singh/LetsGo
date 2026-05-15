FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .

# Same-origin /api via nginx proxy; leave empty for production bundle.
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL

# Optional WebRTC TURN credentials. Required for cross-NAT calls but safe to
# leave empty for LAN-only development (STUN-only ICE). Set via build args in
# docker-compose.prod.yml so prod bundles always ship with TURN configured.
ARG VITE_TURN_URL=
ARG VITE_TURN_USER=
ARG VITE_TURN_PASS=
ENV VITE_TURN_URL=$VITE_TURN_URL
ENV VITE_TURN_USER=$VITE_TURN_USER
ENV VITE_TURN_PASS=$VITE_TURN_PASS

RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
