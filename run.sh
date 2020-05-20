#!/usr/bin/env bash
yarn install && yarn run web-ext run -s src/ -u about:debugging
