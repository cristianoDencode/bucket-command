FROM node:22-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    xvfb \
    xauth \
    libgtk-3-0 \
    libnotify4 \
    libnss3 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    libatspi2.0-0 \
    libuuid1 \
    libsecret-1-0 \
    libasound2 \
    libgbm1 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /work
