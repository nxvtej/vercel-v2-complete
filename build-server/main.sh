#!/bin/bash

export GIT_REPOSITORY__URL="$GIT_REPOSITORY__URL"
# export GIT_REPOSITORY__URL="https://github.com/nxvtej/vercel-v1-frontend"

git clone "$GIT_REPOSITORY__URL" /home/app/output

exec node script.js