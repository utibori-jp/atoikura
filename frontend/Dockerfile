FROM node:20 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
# The image fills in /etc/nginx/templates/*.template at start; the security
# headers' API origin comes from VITE_API_URL (docker-entrypoint.d).
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker-entrypoint.d/15-api-origin.envsh /docker-entrypoint.d/15-api-origin.envsh
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
EXPOSE 80
