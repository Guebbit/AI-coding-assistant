FROM node:20-alpine

WORKDIR /app

ENV HUSKY=0
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 3001

CMD ["npm", "run", "dev"]
