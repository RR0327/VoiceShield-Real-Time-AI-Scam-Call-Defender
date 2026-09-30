#!/usr/bin/env bash
# exit on error
set -o errexit

echo "Building VoiceShield Backend..."

# Upgrade pip
pip install --upgrade pip

# Install dependencies
pip install -r requirements.txt

echo "Build successful!"
