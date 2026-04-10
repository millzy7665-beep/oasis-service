# Use a simple web server to serve the static files
FROM nginx:alpine

# Copy the static web assets to the nginx server directory
COPY www/ /usr/share/nginx/html/

# Update the nginx configuration to listen on the port provided by Google Cloud (usually 8080)
RUN sed -i 's/listen  80;/listen 8080;/' /etc/nginx/conf.d/default.conf

# Expose the port
EXPOSE 8080

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
