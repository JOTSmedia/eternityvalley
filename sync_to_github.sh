#!/bin/bash
echo "Syncing to github_upload..."
rsync -av --exclude 'github_upload' --exclude '.git' --exclude 'scratch' --exclude 'node_modules' --exclude '.DS_Store' ./ github_upload/
echo "Done!"
