FROM ubuntu:14.04.4

MAINTAINER Harrison Powers, harrisonpowers@gmail.com

RUN sudo apt-get update && apt-get install -y curl && \
  curl -sL https://deb.nodesource.com/setup_5.x | sudo -E bash -

RUN sudo apt-get update && apt-get install -y --no-install-recommends \
  nodejs vim build-essential wget openssh-client

RUN curl -fsSL https://get.docker.com/ | sh

RUN npm i pm2 -g

COPY . /usr/src/app
WORKDIR /usr/src/app

RUN npm i

CMD pm2 start index.js -i 1 --no-daemon

EXPOSE 5555
