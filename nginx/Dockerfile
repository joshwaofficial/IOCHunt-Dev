FROM alpine:latest

# Install Nginx and the official headers-more dynamic module
RUN apk update && apk add --no-cache nginx nginx-mod-http-headers-more curl

# Ensure runtime directories exist
RUN mkdir -p /run/nginx /var/log/nginx /etc/nginx/conf.d

EXPOSE 80 443

STOPSIGNAL SIGQUIT

CMD ["nginx", "-g", "daemon off;"]
