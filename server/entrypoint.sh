#!/bin/sh
set -eu
mkdir -p "${DATA_DIR:-/data}"
chown -R pwuser:pwuser "${DATA_DIR:-/data}"
exec runuser -u pwuser -- node /app/index.mjs
