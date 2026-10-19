# ===== CloudBase 云托管 / 任意容器平台用镜像 =====
FROM node:22-alpine

# 时区设为中国，便于游戏内时间显示
RUN apk add tzdata && \
  cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
  echo Asia/Shanghai > /etc/timezone && \
  apk del tzdata

WORKDIR /app

# 先拷贝依赖清单，使用腾讯云镜像源加速安装
COPY package*.json ./
RUN npm config set registry https://mirrors.cloud.tencent.com/npm/ && \
  npm install --omit=dev && \
  npm cache clean --force

# 拷贝业务代码
COPY . .

# 云托管默认监听 8080（可通过环境变量 PORT 覆盖）
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
