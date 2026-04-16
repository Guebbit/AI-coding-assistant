FROM node:22-alpine

WORKDIR /app

ENV HUSKY=0
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package*.json ./
RUN npm ci

COPY . .

CMD ["npm", "run", "dev"]
