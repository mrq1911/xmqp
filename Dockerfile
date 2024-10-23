FROM node:latest

WORKDIR /app
COPY . .
RUN npm install

ENV MNEMONIC your own
ENV WS_ENDPOINT wss://archive.rpc.hydration.cloud

CMD ["npm", "start"]
