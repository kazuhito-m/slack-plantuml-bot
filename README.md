# Slack PlantUML Bot

## Latest integration

- [![ci](https://github.com/kazuhito-m/slack-plantuml-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/kazuhito-m/slack-plantuml-bot/actions/workflows/ci.yml)
- [![CircleCI](https://circleci.com/gh/kazuhito-m/slack-plantuml-bot.svg?style=svg)](https://circleci.com/gh/kazuhito-m/slack-plantuml-bot)

## What's this

Slack上でPlantUMLの記述を行えば画像を返してくれるボット。

## Prerequisite

以下の環境下にて、テスト・ビルドが可能を確認している。

- node.js: `10.24.1`
- npm: `6.14.17`

## Usage

### npm build & node run

```bash
# build
npm install && npm run build
# execute
SLACK_BOT_TOKEN=[your slack bot token] node ./build/bunld.js
```

### Docker image build & run container

```bash
# build
npm run docker-builds
# execute
docker run -d --restart=on-failure -e SLACK_BOT_TOKEN=[your slack bot token] kazuhito/slack-plantuml-bot
```

## 参考

[こちら](./doc/REFERENCE_PUBS.md)

## Author

+ [kazuhito_m](https://twitter.com/kazuhito_m)