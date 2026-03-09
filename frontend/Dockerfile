# ── Stage 1 – placeholder for future build step (e.g. bundler/minifier) ──────
FROM node:22-alpine AS build
WORKDIR /app
COPY index.html style.css app.js lab-scene.js ./

# ── Stage 2 – production nginx image ────────────────────────────────────────
FROM nginx:1.27-alpine

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

# Copy our config + static assets
COPY nginx.conf  /etc/nginx/conf.d/default.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

COPY --from=build /app /usr/share/nginx/html

# Run as non-root (nginx user already exists in the base image)
RUN chown -R nginx:nginx /usr/share/nginx/html \
    && chown -R nginx:nginx /var/cache/nginx \
    && chown -R nginx:nginx /var/log/nginx \
    && chown -R nginx:nginx /etc/nginx/conf.d \
    && touch /var/run/nginx.pid \
    && chown nginx:nginx /var/run/nginx.pid

USER nginx

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
