FROM node:20-alpine

WORKDIR /app

# Dependencies first (cached layer)
COPY frontend/package*.json ./
RUN npm install

# Frontend source
COPY frontend/ .

EXPOSE 5173
CMD ["npm", "run", "dev"]
